import type { Course, LearningConcept } from '../types'
import { applyRecall, conceptKey, type LearningMemory } from './learningState'
import type { RecallRating } from './learningState'

export type EvidenceSource = 'quiz' | 'flashcard' | 'written' | 'chat' | 'study_session'
export type ConceptEvidence = {
  id: string; courseId: string; materialId: string; conceptKey: string; label: string;
  sourceType: EvidenceSource; sourceId: string; result: RecallRating | 'question' | 'seen'; weight: number;
  threadId?: string; messageId?: string; createdAt: string;
}
export function makeEvidence(courseId: string, materialId: string, label: string, result: ConceptEvidence['result'], sourceType: EvidenceSource, sourceId?: string): ConceptEvidence {
  const id = crypto.randomUUID()
  return { id, courseId, materialId, conceptKey: conceptKey(materialId, label).slice(materialId.length + 1),
    label: label.slice(0, 240), result, sourceType, sourceId: sourceId ?? id,
    weight: sourceType === 'chat' || sourceType === 'study_session' ? 0 : sourceType === 'written' ? .5 : 1, createdAt: new Date().toISOString() }
}
export function applyEvidence(memory: LearningMemory, evidence: ConceptEvidence): LearningMemory {
  const key = `${evidence.materialId}:${evidence.conceptKey}`
  const old = memory[key]
  if (old?.pendingEvidenceIds?.includes(evidence.id)) return memory
  const next = evidence.weight > 0 && evidence.result !== 'question' && evidence.result !== 'seen'
    ? applyRecall(memory, evidence.materialId, evidence.label, evidence.result, evidence.weight)
    : { ...memory, [key]: old ?? { key, label: evidence.label, materialId: evidence.materialId, status: 'unknown' as const,
      confidence: 0, attempts: 0, correctAttempts: 0, updatedAt: evidence.createdAt } }
  return { ...next, [key]: { ...next[key], pendingEvidenceIds: [...(old?.pendingEvidenceIds ?? []), evidence.id], evidenceManaged: true, evidenceCount: (old?.evidenceCount ?? 0) + 1,
    legacyAttempts: old?.legacyAttempts ?? (old?.evidenceManaged ? 0 : old?.attempts ?? 0), lastSeen: evidence.createdAt,
    lastPracticed: evidence.weight > 0 ? evidence.createdAt : old?.lastPracticed,
    lastResult: evidence.weight > 0 ? evidence.result : old?.lastResult, updatedAt: evidence.createdAt } }
}
export function getWeakConcepts(memory: LearningMemory, course: Course) {
  const ids = new Set(course.materials.map(material => material.id))
  return Object.values(memory).filter(item => ids.has(item.materialId) && item.attempts > 0 && (item.confidence < .53 || item.lastResult === 'again' || item.lastResult === 'hard'))
    .sort((a, b) => (b.lastResult === 'again' ? 2 : b.lastResult === 'hard' ? 1 : 0) - (a.lastResult === 'again' ? 2 : a.lastResult === 'hard' ? 1 : 0)
      || (b.lastPracticed ?? b.updatedAt).localeCompare(a.lastPracticed ?? a.updatedAt) || a.confidence - b.confidence)
}
export const getRecommendedConcepts = (memory: LearningMemory, course: Course) => getWeakConcepts(memory, course).slice(0, 3)
export function getCourseLearningSummary(memory: LearningMemory, course: Course) {
  const graph = courseConcepts(course, memory)
  return { concepts: graph.length, topics: course.materials.reduce((sum, material) => sum + (material.topics?.length ?? 0), 0),
    practiced: graph.filter(item => item.attempts > 0).length, weak: getWeakConcepts(memory, course) }
}
export function courseConcepts(course: Course, memory: LearningMemory) {
  const ids = new Set(course.materials.map(material => material.id))
  const concepts = new Map(Object.values(memory).filter(item => ids.has(item.materialId)).map(item => [item.key, item]))
  for (const material of course.materials) {
    const artifactLabels = (material.artifacts ?? []).filter(item => item.status === 'ready').flatMap(item => {
      const payload = item.payload as { questions?: unknown[]; cards?: unknown[]; items?: unknown[] } | undefined
      return [...(payload?.questions ?? []), ...(payload?.cards ?? []), ...(payload?.items ?? [])].flatMap(row => {
        const concept = row && typeof row === 'object' ? (row as { concept?: unknown }).concept : undefined
        return typeof concept === 'string' && concept.trim() ? [concept] : []
      })
    })
    const labels = [...artifactLabels, ...(material.topics ?? []).map(topic => topic.title), ...(material.studyPack?.flashcards ?? []).map(card => card.concept).filter(Boolean),
      ...(material.studyPack?.quiz ?? []).map(item => item.concept).filter(Boolean)] as string[]
    for (const label of labels) {
      const key = conceptKey(material.id, label)
      if (!concepts.has(key)) concepts.set(key, { key, label, materialId: material.id, status: 'unknown', confidence: 0, attempts: 0, correctAttempts: 0, updatedAt: '' })
    }
  }
  return [...concepts.values()]
}
export const conceptStatusLabel = (concept: LearningConcept) => concept.attempts === 0 ? 'Sin datos suficientes' :
  concept.status === 'mastered' ? 'Dominio estable' : concept.status === 'known' ? 'Familiar' : 'En aprendizaje'
