export type AppTab = 'inicio' | 'cursos' | 'resolver' | 'corrector' | 'progreso'
export type CourseSection = 'overview' | 'materials' | 'ai' | 'library' | 'practice' | 'progress'
export type MaterialStudyMode = 'learn' | 'flashcards' | 'multiple-choice' | 'written' | 'fill-blanks' | 'notes' | 'exam'

export type AppRoute = {
  tab: AppTab
  courseId?: string
  materialId?: string
  courseSection?: CourseSection
  workspace?: boolean
  materialStudyMode?: MaterialStudyMode
}

export function parseAppRoute(pathname: string): AppRoute {
  const path = pathname.replace(/\/+$/, '') || '/'
  const workspaceMatch = path.match(/^\/courses\/([^/]+)\/materials\/([^/]+)\/workspace$/)
  if (workspaceMatch) {
    try { return { tab: 'cursos', courseId: decodeURIComponent(workspaceMatch[1]), materialId: decodeURIComponent(workspaceMatch[2]), workspace: true } }
    catch { return { tab: 'cursos' } }
  }
  const studyMatch = path.match(/^\/courses\/([^/]+)\/materials\/([^/]+)\/study\/(learn|flashcards|multiple-choice|written|fill-blanks|notes|exam)$/)
  if (studyMatch) {
    try { return { tab: 'cursos', courseId: decodeURIComponent(studyMatch[1]), materialId: decodeURIComponent(studyMatch[2]), materialStudyMode: studyMatch[3] as MaterialStudyMode } }
    catch { return { tab: 'cursos' } }
  }
  const materialMatch = path.match(/^\/courses\/([^/]+)\/materials\/([^/]+)$/)
  if (materialMatch) {
    try { return { tab: 'cursos', courseId: decodeURIComponent(materialMatch[1]), materialId: decodeURIComponent(materialMatch[2]) } }
    catch { return { tab: 'cursos' } }
  }
  const sectionMatch = path.match(/^\/courses\/([^/]+)\/(materials|ai|library|practice|progress)$/)
  if (sectionMatch) {
    try { return { tab: 'cursos', courseId: decodeURIComponent(sectionMatch[1]), courseSection: sectionMatch[2] as CourseSection } }
    catch { return { tab: 'cursos' } }
  }
  const courseMatch = path.match(/^\/courses\/([^/]+)$/)
  if (courseMatch) {
    try { return { tab: 'cursos', courseId: decodeURIComponent(courseMatch[1]) } }
    catch { return { tab: 'cursos' } }
  }
  if (path === '/courses') return { tab: 'cursos' }
  if (path === '/folders') return { tab: 'cursos' }
  if (path === '/resolver') return { tab: 'resolver' }
  if (path === '/corrector') return { tab: 'corrector' }
  if (path === '/study') return { tab: 'cursos' }
  if (path === '/progress') return { tab: 'progreso' }
  return { tab: 'inicio' }
}

export function tabPath(tab: AppTab) {
  return ({
    inicio: '/',
    cursos: '/courses',
    resolver: '/resolver',
    corrector: '/corrector',
    progreso: '/progress',
  } as const)[tab]
}

export function coursePath(courseId: string) {
  return `/courses/${encodeURIComponent(courseId)}`
}

export function materialPath(courseId: string, materialId: string) {
  return `/courses/${encodeURIComponent(courseId)}/materials/${encodeURIComponent(materialId)}`
}

export function courseSectionPath(courseId: string, section: CourseSection) {
  return section === 'overview' ? coursePath(courseId) : `${coursePath(courseId)}/${section}`
}

export function materialWorkspacePath(courseId: string, materialId: string) {
  return `${materialPath(courseId, materialId)}/workspace`
}

export function materialStudyPath(courseId: string, materialId: string, mode: MaterialStudyMode) {
  return `${materialPath(courseId, materialId)}/study/${mode}`
}
