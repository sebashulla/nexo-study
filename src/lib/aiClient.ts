import { supabase } from './supabase'
import type { ImageAttachment } from './imageUtils'
import type { NexoAiMode } from '../types'

export interface SolvePayload {
  task: 'solve' | 'review' | 'study_pack' | 'artifact'
  question: string
  category?: string
  mode?: NexoAiMode
  deep?: boolean
  context?: string
  courseId?: string
  materialId?: string
  page?: number
  artifactType?: string
  images?: ImageAttachment[]
}

export class NexoAiError extends Error {
  constructor(message: string, public readonly kind: 'timeout' | 'rate-limit' | 'network' | 'invalid' | 'service') { super(message) }
}
export function aiErrorMessage(error: unknown) {
  if (error instanceof NexoAiError) return error.message
  return error instanceof Error && /sesión/.test(error.message) ? error.message : 'Nexo no pudo responder ahora. Tu pregunta sigue disponible para reintentar.'
}

export async function callAI(payload: SolvePayload): Promise<string> {
  if (!supabase) throw new Error('Supabase no está configurado.')
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Tu sesión expiró. Inicia sesión nuevamente.')

  let response: Response
  try { response = await fetch('/api/ai/solve', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(120000),
  }) } catch (error) {
    throw new NexoAiError(error instanceof DOMException && /Timeout|Abort/.test(error.name)
      ? 'Nexo tardó demasiado en responder. Tu pregunta sigue aquí para reintentar.' : 'No pudimos conectar con Nexo. Revisa la conexión y reintenta.',
      error instanceof DOMException && /Timeout|Abort/.test(error.name) ? 'timeout' : 'network')
  }
  const result = await response.json().catch(() => ({})) as { text?: string; error?: string }
  if (!response.ok) throw new NexoAiError(response.status === 429 ? 'Nexo recibió demasiadas consultas. Espera un momento y reintenta.' :
    response.status === 504 || response.status === 408 ? 'Nexo tardó demasiado en responder. Reintenta.' :
    result.error && !/gemini|openai|gpt|claude|stack|api.key/i.test(result.error) ? result.error : 'Nexo no está disponible ahora. Puedes reintentar.',
    response.status === 429 ? 'rate-limit' : response.status === 504 || response.status === 408 ? 'timeout' : 'service')
  if (typeof result.text !== 'string' || !result.text.trim()) throw new NexoAiError('Nexo devolvió una respuesta incompleta. Tu pregunta sigue aquí para reintentar.', 'invalid')
  return result.text
}
