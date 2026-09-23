export type AppTab = 'inicio' | 'cursos' | 'carpetas' | 'resolver' | 'corrector' | 'estudiar' | 'progreso'

export type AppRoute = {
  tab: AppTab
  courseId?: string
  materialId?: string
}

export function parseAppRoute(pathname: string): AppRoute {
  const path = pathname.replace(/\/+$/, '') || '/'
  const materialMatch = path.match(/^\/courses\/([^/]+)\/materials\/([^/]+)$/)
  if (materialMatch) {
    try { return { tab: 'estudiar', courseId: decodeURIComponent(materialMatch[1]), materialId: decodeURIComponent(materialMatch[2]) } }
    catch { return { tab: 'cursos' } }
  }
  const courseMatch = path.match(/^\/courses\/([^/]+)$/)
  if (courseMatch) {
    try { return { tab: 'cursos', courseId: decodeURIComponent(courseMatch[1]) } }
    catch { return { tab: 'cursos' } }
  }
  if (path === '/courses') return { tab: 'cursos' }
  if (path === '/folders') return { tab: 'carpetas' }
  if (path === '/resolver') return { tab: 'resolver' }
  if (path === '/corrector') return { tab: 'corrector' }
  if (path === '/study') return { tab: 'estudiar' }
  if (path === '/progress') return { tab: 'progreso' }
  return { tab: 'inicio' }
}

export function tabPath(tab: AppTab) {
  return ({
    inicio: '/',
    cursos: '/courses',
    carpetas: '/folders',
    resolver: '/resolver',
    corrector: '/corrector',
    estudiar: '/study',
    progreso: '/progress',
  } as const)[tab]
}

export function coursePath(courseId: string) {
  return `/courses/${encodeURIComponent(courseId)}`
}

export function materialPath(courseId: string, materialId: string) {
  return `/courses/${encodeURIComponent(courseId)}/materials/${encodeURIComponent(materialId)}`
}
