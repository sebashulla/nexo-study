import { callNexoEngine } from '../../server/aiEngine.mjs'
import { verifySupabaseUser } from '../../server/authGuard.mjs'

export const config = { maxDuration: 60 }

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'no-referrer')

  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido.' })

  try {
    await verifySupabaseUser(req)
    const result = await callNexoEngine(req.body || {})
    return res.status(200).json(result)
  } catch (error) {
    const status = Number(error?.status || 500)
    if (status >= 500) console.error('[Nexo API]', error)
    return res.status(status).json({ error: error?.publicMessage || 'Nexo IA no pudo completar la solicitud.' })
  }
}
