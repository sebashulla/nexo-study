import { isAIConfigured } from '../server/aiEngine.mjs'

export default function handler(_req, res) {
  res.setHeader('Cache-Control', 'no-store')
  res.status(200).json({ ok: true, product: 'Nexo IA', aiConfigured: isAIConfigured() })
}
