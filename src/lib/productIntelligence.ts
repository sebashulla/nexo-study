import { getWeakConcepts } from './learningGraph'
import type { Course, LearningConcept, Material, StudySession } from '../types'
import type { LearningMemory } from './learningState'
import type { StudyActivity } from './studyProgress'

export type CourseRecommendation = {
  id: string
  text: string
  action: 'continue' | 'practice' | 'review' | 'analyze' | 'session'
  materialId?: string
  concept?: LearningConcept
}

export function recentMaterial(course: Course, activity: StudyActivity): Material | undefined {
  return [...course.materials].sort((a, b) =>
    (activity[b.id]?.lastStudiedAt ?? b.createdAt ?? '').localeCompare(activity[a.id]?.lastStudiedAt ?? a.createdAt ?? ''))[0]
}

export function weakConceptsFor(course: Course, memory: LearningMemory, limit = 5) {
  return getWeakConcepts(memory, course).slice(0, limit)
}

export function courseRecommendations(course: Course, activity: StudyActivity, memory: LearningMemory,
  sessions: StudySession[]): CourseRecommendation[] {
  const result: CourseRecommendation[] = []
  const recent = recentMaterial(course, activity)
  const weak = weakConceptsFor(course, memory)
  const unfinished = sessions.find(session => session.courseId === course.id && session.status !== 'completed')
  if (unfinished) result.push({ id: `session:${unfinished.id}`, text: 'Tienes una sesión pendiente para continuar.', action: 'session' })
  if (weak.length) result.push({ id: `weak:${course.id}`, text: `${weak.length} ${weak.length === 1 ? 'concepto necesita' : 'conceptos necesitan'} repaso.`,
    action: 'review', materialId: weak[0].materialId, concept: weak[0] })
  const unpracticed = course.materials.find(material => activity[material.id]?.summaryViewed &&
    !Object.keys(activity[material.id]?.answers ?? {}).length && !Object.keys(activity[material.id]?.practiceAttempts ?? {}).length)
  if (unpracticed) result.push({ id: `practice:${unpracticed.id}`, text: `Todavía no has practicado ${unpracticed.title}.`,
    action: 'practice', materialId: unpracticed.id })
  const partial = course.materials.find(material => material.sourceType === 'pdf' && material.analysisStatus === 'partial' &&
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
  const priorities = courses.map(course => ({course,weak:weakConceptsFor(course,memory)})).filter(item => item.weak.length)
    .sort((a,b) => (b.weak[0].lastResult === 'again' ? 2 : b.weak[0].lastResult === 'hard' ? 1 : 0) - (a.weak[0].lastResult === 'again' ? 2 : a.weak[0].lastResult === 'hard' ? 1 : 0)
      || (b.weak[0].lastPracticed ?? b.weak[0].updatedAt).localeCompare(a.weak[0].lastPracticed ?? a.weak[0].updatedAt))
  for (const {course,weak} of priorities) actions.push({ id: `weak:${course.id}`, courseId: course.id, materialId: weak[0].materialId, concept: weak[0], action: 'review', text: `${weak[0].label} · ${weak.length} conceptos por reforzar. ${weak[0].lastResult === 'hard' ? 'Última tarjeta difícil' : weak[0].lastResult === 'again' ? 'Última práctica por reforzar' : `${weak.length} conceptos por reforzar en ${course.name}`}.` })
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
  if (actions.length < 2) for (const course of courses) {
    const ids = new Set(course.materials.map(item => item.id))
    const seen = Object.values(memory).find(item => ids.has(item.materialId) && item.attempts === 0 && (item.evidenceCount ?? 0) > 0)
    if (seen && !actions.some(item => item.materialId === seen.materialId)) actions.push({ id: `seen:${seen.key}`, courseId: course.id, materialId: seen.materialId, concept: seen, action: 'practice', text: `${seen.label} · Lo consultaste, aún sin práctica registrada.` })
    const stale = Object.values(memory).filter(item => ids.has(item.materialId) && item.attempts > 0 && item.lastPracticed && Date.now() - new Date(item.lastPracticed).getTime() >= 6 * 86400000).sort((a,b) => (a.lastPracticed ?? '').localeCompare(b.lastPracticed ?? ''))[0]
    if (stale && !actions.some(item => item.materialId === stale.materialId)) actions.push({ id: `stale:${stale.key}`, courseId: course.id, materialId: stale.materialId, concept: stale, action: 'review', text: `${stale.label} · Sin práctica en ${Math.floor((Date.now() - new Date(stale.lastPracticed!).getTime()) / 86400000)} días.` })
    const partial = course.materials.find(item => item.sourceType === 'pdf' && item.analysisStatus === 'partial' && !actions.some(action => action.materialId === item.id))
    if (partial) actions.push({ id: `analyze:${partial.id}`, courseId: course.id, materialId: partial.id, action: 'analyze', text: `${partial.title} · ${partial.analyzedPages?.length ?? 0} de ${partial.pageCount ?? '…'} páginas preparadas.` })
  }
  return actions.slice(0, 2)
}
