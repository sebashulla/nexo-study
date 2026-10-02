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

export type TodayAction = CourseRecommendation & { courseId: string }

export function todayActions(courses: Course[], activity: StudyActivity, memory: LearningMemory, sessions: StudySession[]): TodayAction[] {
  const actions: TodayAction[] = []
  const ids = new Set(courses.map(course => course.id))
  const unfinished = sessions.filter(session => ids.has(session.courseId) && session.status !== 'completed').sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  if (unfinished) actions.push({ id: `session:${unfinished.id}`, courseId: unfinished.courseId, action: 'session', text: 'Continúa tu sesión pendiente.' })
  for (const course of courses) {
    const weak = weakConceptsFor(course, memory)
    if (weak.length) actions.push({ id: `weak:${course.id}`, courseId: course.id, materialId: weak[0].materialId, action: 'review', text: `Repasa ${weak.length} conceptos por reforzar en ${course.name}.` })
  }
  for (const course of courses) {
    const errors = course.materials.map(material => ({ material, count: [...Object.values(activity[material.id]?.answers ?? {}), ...Object.values(activity[material.id]?.practiceAttempts ?? {})].filter(value => value === false).length }))
      .filter(item => item.count > 0).sort((a, b) => b.count - a.count)[0]
    if (errors && !actions.some(item => item.materialId === errors.material.id)) actions.push({ id: `errors:${errors.material.id}`, courseId: course.id, materialId: errors.material.id, action: 'practice', text: `Vuelve a practicar ${errors.material.title}: ${errors.count} respuestas por revisar.` })
  }
  for (const course of courses) {
    const material = course.materials.find(item => activity[item.id]?.summaryViewed && !Object.keys(activity[item.id]?.answers ?? {}).length && !Object.keys(activity[item.id]?.practiceAttempts ?? {}).length)
    if (material && !actions.some(item => item.materialId === material.id)) actions.push({ id: `practice:${material.id}`, courseId: course.id, materialId: material.id, action: 'practice', text: `Practica ${material.title}; ya abriste su contenido.` })
  }
  if (!actions.length) {
    const recent = courses.flatMap(course => course.materials.filter(material => activity[material.id]?.lastStudiedAt).map(material => ({ course, material })))
      .sort((a, b) => (activity[b.material.id]?.lastStudiedAt ?? '').localeCompare(activity[a.material.id]?.lastStudiedAt ?? ''))[0]
    if (recent) actions.push({ id: `continue:${recent.material.id}`, courseId: recent.course.id, materialId: recent.material.id, action: 'continue', text: `Continúa ${recent.material.title}.` })
  }
  return actions.slice(0, 3)
}
