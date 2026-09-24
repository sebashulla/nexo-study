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
  artifactType?: string
  images?: ImageAttachment[]
}

export async function callAI(payload: SolvePayload): Promise<string> {
  if (!supabase) throw new Error('Supabase no está configurado.')
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Tu sesión expiró. Inicia sesión nuevamente.')

  const response = await fetch('/api/ai/solve', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  })
  const result = await response.json().catch(() => ({})) as { text?: string; error?: string }
  if (!response.ok) throw new Error(result.error || `Error ${response.status}`)
  return result.text || ''
}
