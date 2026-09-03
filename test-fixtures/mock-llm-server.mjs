// Mock OpenAI-compatible Chat Completions server for --vlm/--llm E2E tests.
// Keys canned JSON responses off keywords in the prompt text, and rejects
// requests whose image parts are malformed — so the test exercises the real
// screenshot→base64→wire path. Usage: node test-fixtures/mock-llm-server.mjs [port]
import { createServer } from 'node:http'

const port = Number(process.argv[2] ?? 4941)

const respond = (promptText, imageCount) => {
  if (promptText.includes('adjudicating')) {
    return '[{"sc": "2.4.6", "status": "pass", "confidence": "high", "evidence": "headings describe sections"}]'
  }
  if (promptText.includes('alt text conveys') || promptText.includes('ADEQUACY')) {
    return JSON.stringify(
      Array.from({ length: imageCount }, (_, index) => ({
        index,
        adequate: false,
        reason: 'alt restates the medium, not the information',
        proposedAlt: 'Mock proposed alt describing the image content',
      })),
    )
  }
  if (promptText.includes('grayscale')) {
    return '{"colorOnlyMeaning": true, "where": "status badges", "explanation": "badges differ only by hue"}'
  }
  if (promptText.includes('numbered red badges') || promptText.includes('Tab order')) {
    return '{"followsVisualOrder": false, "explanation": "numbering jumps between columns"}'
  }
  if (promptText.includes('contrast')) {
    return JSON.stringify(Array.from({ length: imageCount }, (_, index) => ({ index, sufficient: false, explanation: 'text blends into background' })))
  }
  if (promptText.includes('320')) {
    return '{"issues": ["heading truncated mid-word at narrow width"]}'
  }
  if (promptText.includes('hovering')) {
    return '{"issues": ["tooltip covers the submit button"]}'
  }
  if (promptText.includes('form region')) {
    return '{"issues": []}'
  }
  if (promptText.includes('frame of a video')) {
    return '{"description": "a person speaking to camera with on-screen text", "looksLikeContent": true}'
  }
  return '{"issues": []}'
}

createServer((req, res) => {
  if (req.method !== 'POST' || !req.url?.endsWith('/chat/completions')) {
    res.writeHead(404).end('{"error":"not found"}')
    return
  }
  let body = ''
  req.on('data', (chunk) => (body += chunk))
  req.on('end', () => {
    try {
      const payload = JSON.parse(body)
      const content = payload.messages?.[0]?.content
      const parts = Array.isArray(content) ? content : [{ type: 'text', text: String(content ?? '') }]
      const text = parts.filter((p) => p.type === 'text').map((p) => p.text).join('\n')
      const images = parts.filter((p) => p.type === 'image_url')
      for (const img of images) {
        const url = img.image_url?.url ?? ''
        if (!url.startsWith('data:image/png;base64,') || url.length < 200) {
          throw new Error('malformed image part')
        }
      }
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ choices: [{ message: { content: respond(text, images.length) } }] }))
    } catch (error) {
      res.writeHead(400, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: String(error) }))
    }
  })
}).listen(port, '127.0.0.1', () => console.log(`mock llm on http://127.0.0.1:${port}/v1`))
