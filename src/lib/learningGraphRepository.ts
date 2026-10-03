import type { LearningConcept, MaterialTopic } from '../types'
import { applyEvidence, type ConceptEvidence } from './learningGraph'
export * from './learningGraph'
import { supabase } from './supabase'

const queueKey = (userId: string) => `nexo-evidence-pending-v1:${userId}`
const cacheKey = (userId: string) => `nexo-evidence-recent-v1:${userId}`
export const LEARNING_CHANGED = 'nexo-learning-changed'
export function mapConcept(row: Record<string, unknown>): LearningConcept {
  const materialId = String(row.material_id)
  return { key: `${materialId}:${row.concept_key}`, label: String(row.concept_label), materialId,
    status: row.status as LearningConcept['status'], confidence: Number(row.confidence), attempts: Number(row.attempts),
    correctAttempts: Number(row.correct_attempts), updatedAt: String(row.updated_at), evidenceManaged: row.evidence_managed === true,
    evidenceCount: Number(row.evidence_count ?? 0), lastSeen: row.last_seen as string || undefined,
    lastPracticed: row.last_practiced as string || undefined, lastResult: row.last_result as string || undefined,
    legacyAttempts: Number((row.legacy_baseline as { attempts?: number } | undefined)?.attempts ?? (row.evidence_managed ? 0 : row.attempts)) }
}
function readEvidence(key: string): ConceptEvidence[] {
  try { const value: unknown = JSON.parse(localStorage.getItem(key) ?? '[]'); return Array.isArray(value) ? value.filter(item => item && typeof item.id === 'string' && typeof item.conceptKey === 'string' && typeof item.materialId === 'string') : [] } catch { return [] }
}
export const pendingEvidence = (userId: string) => readEvidence(queueKey(userId))
export function discardMaterialEvidence(userId: string, materialIds: string[]) {
  const ids = new Set(materialIds)
  try {
    localStorage.setItem(queueKey(userId),JSON.stringify(pendingEvidence(userId).filter(item => !ids.has(item.materialId))))
    localStorage.setItem(cacheKey(userId),JSON.stringify(recentEvidence(userId).filter(item => !ids.has(item.materialId))))
  } catch { /* Server cleanup already completed; storage denial must not stop UI cleanup. */ }
}
export const recentEvidence = (userId: string) => readEvidence(cacheKey(userId))
export function forgetConversationEvidence(userId: string, threadId: string) {
  localStorage.setItem(cacheKey(userId), JSON.stringify(recentEvidence(userId).filter(item => item.threadId !== threadId)))
  localStorage.setItem(queueKey(userId), JSON.stringify(pendingEvidence(userId).filter(item => item.threadId !== threadId)))
}
export function queueEvidence(userId: string, evidence: ConceptEvidence) {
  const queue = pendingEvidence(userId)
  if (!queue.some(item => item.id === evidence.id)) localStorage.setItem(queueKey(userId), JSON.stringify([...queue, evidence]))
  localStorage.setItem(cacheKey(userId), JSON.stringify([evidence, ...recentEvidence(userId).filter(item => item.id !== evidence.id)].slice(0, 120)))
  window.dispatchEvent(new CustomEvent(LEARNING_CHANGED, { detail: { userId, evidence } }))
}
export async function recordEvidence(evidence: ConceptEvidence): Promise<LearningConcept> {
  if (!supabase) throw new Error('No pudimos sincronizar la evidencia de aprendizaje.')
  const { data, error } = await supabase.rpc('record_concept_evidence', { p_evidence: {
    id: evidence.id, course_id: evidence.courseId, material_id: evidence.materialId, concept_key: evidence.conceptKey,
    concept_label: evidence.label, source_type: evidence.sourceType, source_id: evidence.sourceId, result: evidence.result,
    thread_id: evidence.threadId ?? null, message_id: evidence.messageId ?? null,
  } })
  if (error || !data?.material_id) throw error ?? new Error('No pudimos sincronizar la evidencia de aprendizaje.')
  return mapConcept(data)
}
const flushes = new Map<string, Promise<void>>()
export function flushEvidence(userId: string) {
  const existing = flushes.get(userId)
  if (existing) return existing
  const flushing = (async () => {
    const session = await supabase?.auth.getSession()
    if (session?.data.session?.user.id !== userId) throw new Error('Tu sesión cambió. Inicia sesión para sincronizar esta memoria.')
    // Re-read after every acknowledgement: another tab can append independently.
    while (pendingEvidence(userId).length) {
      const evidence = pendingEvidence(userId)[0]
      const concept = await recordEvidence(evidence)
      localStorage.setItem(queueKey(userId), JSON.stringify(pendingEvidence(userId).filter(item => item.id !== evidence.id)))
      const remaining = pendingEvidence(userId).filter(item => `${item.materialId}:${item.conceptKey}` === concept.key)
      const memory = remaining.reduce(applyEvidence, { [concept.key]: concept })
      window.dispatchEvent(new CustomEvent(LEARNING_CHANGED, { detail: { userId, concept: memory[concept.key] } }))
    }
  })().finally(() => { flushes.delete(userId) })
  flushes.set(userId, flushing)
  return flushing
}
export async function getConceptState(userId: string, courseId: string) {
  if (!supabase) throw new Error('No pudimos cargar la memoria del curso.')
  const { data, error } = await supabase.from('learning_state').select('*').eq('user_id', userId).eq('course_id', courseId).order('updated_at', { ascending: false }).limit(300)
  if (error) throw error
  return (data ?? []).map(mapConcept)
}
export async function getCourseTopics(userId: string, courseId: string) {
  if (!supabase) throw new Error('No pudimos cargar los temas del curso.')
  const { data, error } = await supabase.from('material_topics').select('id,material_id,title,summary,page_start,page_end,keywords')
    .eq('user_id', userId).eq('course_id', courseId).order('page_start', { ascending: true }).limit(201)
  if (error) throw error
  const topics: MaterialTopic[] = (data ?? []).slice(0, 200).map(row => ({ id: row.id, materialId: row.material_id, title: row.title,
    summary: row.summary, pageStart: row.page_start, pageEnd: row.page_end, keywords: row.keywords ?? [] }))
  return { topics, truncated: (data?.length ?? 0) > 200 }
}
export type EvidenceCursor = { time: string; id: string }
export async function getEvidence(userId: string, materialId: string, key: string, before?: EvidenceCursor) {
  if (!supabase) throw new Error('No pudimos cargar las evidencias.')
  let query = supabase.from('concept_evidence').select('*').eq('user_id', userId).eq('material_id', materialId).eq('concept_key', key)
  if (before) query = query.or(`created_at.lt.${before.time},and(created_at.eq.${before.time},id.lt.${before.id})`)
  const { data, error } = await query.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(21)
  if (error) throw error
  const evidence: ConceptEvidence[] = (data ?? []).slice(0, 20).map(row => ({ id: row.id, courseId: row.course_id, materialId: row.material_id,
    conceptKey: row.concept_key, label: row.concept_label, sourceType: row.source_type, sourceId: row.source_id, result: row.result,
    weight: Number(row.weight), threadId: row.thread_id ?? undefined, messageId: row.message_id ?? undefined, createdAt: row.created_at }))
  const last = evidence.slice(-1)[0]
  return { evidence, cursor: (data?.length ?? 0) > 20 && last ? { time: last.createdAt, id: last.id } : undefined }
}
export async function deleteEvidence(userId: string, id: string) {
  if (!supabase) throw new Error('No pudimos eliminar esta señal.')
  await flushEvidence(userId)
  const { error } = await supabase.from('concept_evidence').delete().eq('user_id', userId).eq('id', id)
  if (error) throw error
  localStorage.setItem(cacheKey(userId), JSON.stringify(recentEvidence(userId).filter(item => item.id !== id)))
  window.dispatchEvent(new CustomEvent(LEARNING_CHANGED, { detail: { userId, refresh: true } }))
}
export async function resetCourseMemory(userId: string, courseId: string) {
  if (!supabase) throw new Error('No pudimos reiniciar la memoria.')
  // Flush first: a pending older answer must not silently resurrect erased memory.
  await flushEvidence(userId)
  const { error } = await supabase.rpc('reset_course_learning_memory', { p_course_id: courseId })
  if (error) throw error
  localStorage.setItem(cacheKey(userId), JSON.stringify(recentEvidence(userId).filter(item => item.courseId !== courseId)))
  window.dispatchEvent(new CustomEvent(LEARNING_CHANGED, { detail: { userId, resetCourseId: courseId, refresh: true } }))
}
