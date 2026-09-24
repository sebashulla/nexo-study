import type { Course, StudySession } from '../types'
import type { StudyActivity } from './studyProgress'
import { masterySummary, type LearningMemory } from './learningState'

export type SessionObjective = 'quick' | 'exam' | 'weak' | 'all'
export type SessionDuration = 15 | 30 | 45

const allocations: Record<SessionDuration, [number, number, number, number]> = {
  15: [3, 5, 5, 2], 30: [5, 10, 10, 5], 45: [8, 15, 15, 7],
}

export function buildStudySession(course: Course, activity: StudyActivity, memory: LearningMemory, durationMinutes: SessionDuration, objective: SessionObjective): StudySession {
  if (!course.materials.length) throw new Error('Agrega un material antes de preparar una sesión.')
  const weak = masterySummary(memory, course.materials.map(material => material.id)).weak
  const weakIds = [...new Set(weak.map(item => item.materialId))]
  const recent = [...course.materials].sort((a, b) => (activity[b.id]?.lastStudiedAt ?? '').localeCompare(activity[a.id]?.lastStudiedAt ?? ''))
  const order = objective === 'weak' && weakIds.length
    ? [...weakIds, ...recent.map(material => material.id).filter(id => !weakIds.includes(id))]
    : recent.map(material => material.id)
  const [learn, questions, cards, errors] = allocations[durationMinutes]
  const plan: StudySession['plan'] = [
    { type: 'learn', minutes: learn, materialId: order[0] },
    { type: 'multiple-choice', minutes: questions, materialId: order[1 % order.length] },
    { type: 'flashcards', minutes: cards, materialId: order[2 % order.length] },
    { type: 'review-errors', minutes: errors, materialId: (weakIds[0] ?? order[0]) },
  ]
  return { id: crypto.randomUUID(), courseId: course.id, objective, durationMinutes,
    status: 'planned', plan, results: {}, createdAt: new Date().toISOString() }
}

export function completeSessionStep(session: StudySession, step: number): StudySession {
  const results = { ...session.results, [String(step)]: 1 }
  const completed = session.plan.every((_, index) => results[String(index)] === 1)
  return { ...session, results, status: completed ? 'completed' : 'active', completedAt: completed ? new Date().toISOString() : undefined }
}

export function loadLocalSessions(userId: string): StudySession[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(`nexo-sessions-v1:${userId}`) || '[]')
    return Array.isArray(value) ? value.filter(item => item && typeof item.id === 'string' && typeof item.courseId === 'string') : []
  } catch { return [] }
}

export function saveLocalSessions(userId: string, sessions: StudySession[]) {
  localStorage.setItem(`nexo-sessions-v1:${userId}`, JSON.stringify(sessions))
}
