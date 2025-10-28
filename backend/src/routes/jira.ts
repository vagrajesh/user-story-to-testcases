import express from 'express'
import fetch from 'node-fetch'

export const jiraRouter = express.Router()

/**
 * GET /api/jira/fetch/:jiraId
 * Returns a small payload with storyTitle, description, and acceptanceCriteria (best-effort).
 * Expects the following env vars to be set on the backend: JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN
 */
jiraRouter.get('/fetch/:jiraId', async (req: express.Request, res: express.Response) => {
  try {
    const { jiraId } = req.params

    if (!jiraId) {
      res.status(400).json({ error: 'Missing Jira ID in path' })
      return
    }

    const baseUrl = process.env.JIRA_BASE_URL
    const email = process.env.JIRA_EMAIL
    const apiToken = process.env.JIRA_API_TOKEN

    if (!baseUrl || !email || !apiToken) {
      res.status(500).json({ error: 'Jira configuration not set on the server (JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN)' })
      return
    }

    // Jira Cloud uses basic auth with email:api_token base64
    const auth = Buffer.from(`${email}:${apiToken}`).toString('base64')

    // Request the issue fields we care about
    const url = `${baseUrl.replace(/\/$/, '')}/rest/api/3/issue/${encodeURIComponent(jiraId)}?fields=summary,description`

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json'
      }
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      res.status(response.status).json({ error: `Jira API error: ${response.status} ${text}` })
      return
    }

  const data: any = await response.json()

    // Extract summary
    const storyTitle = data?.fields?.summary || ''

    // description can be rich content ( Atlassian Document Format ) — try to extract plain text
    let description = ''
    try {
      const descField = data?.fields?.description
      if (typeof descField === 'string') {
        description = descField
      } else if (descField && Array.isArray(descField.content)) {
        // Flatten the ADF to simple text
        const parts: string[] = []
        const walk = (node: any) => {
          if (!node) return
          if (typeof node === 'string') return parts.push(node)
          if (Array.isArray(node)) return node.forEach(walk)
          if (node.type === 'text' && node.text) return parts.push(node.text)
          if (node.content) return walk(node.content)
        }
        walk(descField.content)
        description = parts.join('\n')
      }
    } catch (err) {
      description = ''
    }

    // As a best-effort, use description as acceptanceCriteria if no dedicated field exists
    const acceptanceCriteria = description || ''

    res.json({ storyTitle, description, acceptanceCriteria, raw: data })
  } catch (error) {
    console.error('Error fetching Jira story:', error)
    res.status(500).json({ error: 'Failed to fetch Jira story' })
  }
})

export default jiraRouter
