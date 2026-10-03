import { verifySupabaseUser } from '../../server/authGuard.mjs'
import { processRemoteSource } from '../../server/sourceExtraction.mjs'

export const config = { maxDuration: 30 }
export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store'); res.setHeader('X-Content-Type-Options','nosniff')
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido.' })
  try {
    await verifySupabaseUser(req)
    if (Buffer.byteLength(JSON.stringify(req.body ?? {})) > 12000) return res.status(413).json({ error: 'La solicitud supera el límite permitido.' })
    return res.status(200).json(await processRemoteSource(req.body))
  } catch (error) { return res.status(Number(error.status ?? 500)).json({ error: error.publicMessage ?? 'No pudimos preparar esta fuente. Puedes reintentar.' }) }
}
