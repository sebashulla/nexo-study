import type { Course, Material, StudySession } from '../types'
import type { LearningMemory } from './learningState'
import type { StudyActivity } from './studyProgress'

export type CourseRecommendation = {
  id: string
  text: string
  action: 'continue' | 'practice' | 'review' | 'analyze' | 'session'
  materialId?: string
}

export function recentMaterial(course: Course, activity: StudyActivity): Material | undefined {
  return [...course.materials].sort((a, b) =>
    (activity[b.id]?.lastStudiedAt ?? b.createdAt ?? '').localeCompare(activity[a.id]?.lastStudiedAt ?? a.createdAt ?? ''))[0]
}

export function weakConceptsFor(course: Course, memory: LearningMemory, limit = 5) {
  const ids = new Set(course.materials.map(material => material.id))
  return Object.values(memory).filter(concept => ids.has(concept.materialId) && concept.attempts > 0 && concept.confidence < .53)
    .sort((a, b) => a.confidence - b.confidence).slice(0, limit)
}

export function courseRecommendations(course: Course, activity: StudyActivity, memory: LearningMemory,
  sessions: StudySession[]): CourseRecommendation[] {
  const result: CourseRecommendation[] = []
  const recent = recentMaterial(course, activity)
  const weak = weakConceptsFor(course, memory)
  const unfinished = sessions.find(session => session.courseId === course.id && session.status !== 'completed')
  if (unfinished) result.push({ id: `session:${unfinished.id}`, text: 'Tienes una sesión pendiente para continuar.', action: 'session' })
  if (weak.length) result.push({ id: `weak:${course.id}`, text: `${weak.length} ${weak.length === 1 ? 'concepto necesita' : 'conceptos necesitan'} repaso.`,
    action: 'review', materialId: weak[0].materialId })
  const unpracticed = course.materials.find(material => activity[material.id]?.summaryViewed &&
    !Object.keys(activity[material.id]?.answers ?? {}).length && !Object.keys(activity[material.id]?.practiceAttempts ?? {}).length)
  if (unpracticed) result.push({ id: `practice:${unpracticed.id}`, text: `Todavía no has practicado ${unpracticed.title}.`,
    action: 'practice', materialId: unpracticed.id })
  const partial = course.materials.find(material => material.analysisStatus === 'partial' &&
    material.documentKind !== 'scan' && (material.analyzedPages?.length ?? 0) < (material.pageCount ?? 0))
  if (partial) result.push({ id: `analyze:${partial.id}`, text: `${partial.analyzedPages?.length ?? 0} de ${partial.pageCount} páginas preparadas en ${partial.title}.`,
    action: 'analyze', materialId: partial.id })
  if (recent && !result.length) result.push({ id: `continue:${recent.id}`, text: `Retoma ${recent.title}.`, action: 'continue', materialId: recent.id })
  return result.slice(0, 3)
}
