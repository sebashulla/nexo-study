import http from 'node:http'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { callNexoEngine, isAIConfigured } from './server/aiEngine.mjs'
import { verifySupabaseUser } from './server/authGuard.mjs'

const ROOT = dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT || 4173)
const MAX_BODY = 4 * 1024 * 1024

async function loadDotEnv() {
  for (const name of ['.env.local', '.env']) {
    try {
      const raw = await readFile(join(ROOT, name), 'utf8')
      for (const line of raw.split(/\r?\n/)) {
        const row = line.trim()
        if (!row || row.startsWith('#') || !row.includes('=')) continue
        const [key, ...rest] = row.split('=')
        if (!process.env[key.trim()]) process.env[key.trim()] = rest.join('=').trim().replace(/^['"]|['"]$/g, '')
      }
    } catch {}
  }
}
await loadDotEnv()

function json(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  })
  res.end(JSON.stringify(body))
}

async function readJson(req) {
  let size = 0
  const chunks = []
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY) {
      const error = new Error('Request too large')
      error.status = 413
      error.publicMessage = 'Las imágenes o el texto superan el tamaño permitido para esta beta.'
      throw error
    }
    chunks.push(chunk)
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') }
  catch {
    const error = new Error('Invalid JSON')
    error.status = 400
    error.publicMessage = 'No se pudo leer la solicitud.'
    throw error
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/api/health') {
      return json(res, 200, { ok: true, product: 'Nexo IA', aiConfigured: isAIConfigured() })
    }
    if (req.method === 'POST' && req.url === '/api/ai/solve') {
      await verifySupabaseUser(req)
      const payload = await readJson(req)
      return json(res, 200, await callNexoEngine(payload))
    }
    return json(res, 404, { error: 'No encontrado.' })
  } catch (error) {
    const status = Number(error?.status || 500)
    if (status >= 500) console.error('[Nexo local API]', error)
    return json(res, status, { error: error?.publicMessage || 'Nexo IA no pudo completar la solicitud.' })
  }
})

server.listen(PORT, () => {
  console.log(`Nexo API local: http://localhost:${PORT}`)
})
