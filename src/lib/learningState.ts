import type { LearningConcept, LearningStatus } from '../types'

export type LearningMemory = Record<string, LearningConcept>
export type RecallRating = 'again' | 'hard' | 'good' | 'easy'

const score: Record<RecallRating, number> = { again: 0, hard: .35, good: .78, easy: 1 }

export function conceptKey(materialId: string, concept: string) {
  const normalized = concept.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90)
  return `${materialId}:${normalized || 'concepto'}`
}

export function applyRecall(memory: LearningMemory, materialId: string, label: string, rating: RecallRating): LearningMemory {
  const key = conceptKey(materialId, label)
  const previous = memory[key]
  const attempts = (previous?.attempts ?? 0) + 1
  const correctAttempts = (previous?.correctAttempts ?? 0) + (rating === 'good' || rating === 'easy' ? 1 : 0)
  const confidence = Math.max(0, Math.min(1, Math.round(((previous?.confidence ?? 0) * .64 + score[rating] * .36) * 1000) / 1000))
  let status: LearningStatus = 'learning'
  if (attempts >= 3 && confidence >= .82) status = 'mastered'
  else if (attempts >= 2 && confidence >= .53) status = 'known'
  return { ...memory, [key]: { key, label, materialId, status, confidence, attempts, correctAttempts, updatedAt: new Date().toISOString() } }
}

export function masterySummary(memory: LearningMemory, materialIds: string[]) {
  const ids = new Set(materialIds)
  const concepts = Object.values(memory).filter(item => ids.has(item.materialId))
  return {
    concepts: concepts.length,
    mastered: concepts.filter(item => item.status === 'mastered').length,
    weak: concepts.filter(item => item.status === 'learning' && item.attempts > 0).sort((a, b) => a.confidence - b.confidence),
    percent: concepts.length ? Math.round(concepts.reduce((sum, item) => sum + item.confidence, 0) / concepts.length * 100) : 0,
  }
}

export function loadLearningMemory(userId: string): LearningMemory {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(`nexo-learning-v1:${userId}`) || '{}')
    return value && typeof value === 'object' && !Array.isArray(value) ? value as LearningMemory : {}
  } catch { return {} }
}

export function saveLearningMemory(userId: string, memory: LearningMemory) {
  localStorage.setItem(`nexo-learning-v1:${userId}`, JSON.stringify(memory))
}
