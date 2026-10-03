import type { Course } from './types'
import type { StudyActivity } from './lib/studyProgress'
import { workspaceProgress } from './lib/studyProgress'
import { PopupMenu } from './PopupMenu'

export function CourseCard({ course, activity, onOpen, onEdit, onMove, onDelete }: {
  course: Course; activity: StudyActivity; onOpen: () => void; onEdit: () => void; onMove: () => void; onDelete: () => void
}) {
  const last = course.materials.map(material => activity[material.id]?.lastStudiedAt).filter((value): value is string => Boolean(value)).sort().slice(-1)[0]
  return <article className="course-card-frame">
    <button className="course-library-card" onClick={onOpen}><span>{course.emoji}</span><div><strong>{course.name}</strong><small>{course.materials.length} {course.materials.length === 1 ? 'material' : 'materiales'}</small></div><b>{last ? `Última actividad ${new Date(last).toLocaleDateString('es-PE')} · ${workspaceProgress([course], activity).percent}% de actividad` : 'Listo para empezar'} →</b></button>
    <PopupMenu mobileSheet className="course-card-menu" label={`Opciones de ${course.name}`} trigger="···" triggerClass="context-menu-trigger" menuLabel={`Acciones de ${course.name}`}>
      <button role="menuitem" onClick={onEdit}>Editar curso</button><button role="menuitem" onClick={onMove}>Mover a espacio</button><button role="menuitem" onClick={onDelete}>Eliminar curso</button>
    </PopupMenu>
  </article>
}
