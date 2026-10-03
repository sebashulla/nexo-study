import type { Course, Material } from './types'
import { coursePath } from './lib/router'
import { useMediaQuery } from './hooks/useMediaQuery'

export function ContextNavigation({ course, material, navigate }: { course?: Course; material?: Material; navigate: (path: string) => void }) {
  const mobile = useMediaQuery('(max-width: 700px)')
  if (mobile) return <nav className="mobile-context-back" aria-label="Volver al contexto"><button className="text-button" onClick={() => navigate(material && course ? coursePath(course.id) : '/courses')}>← {material && course ? course.name : 'Cursos'}</button></nav>
  return <nav className="route-breadcrumbs" aria-label="Ubicación actual"><button onClick={() => navigate('/courses')}>Cursos</button>{course && <><span>›</span><button onClick={() => navigate(coursePath(course.id))}>{course.emoji} {course.name}</button></>}{material && <><span>›</span><strong>{material.title}</strong></>}</nav>
}
