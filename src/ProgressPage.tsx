import type { Course } from './types'
import { materialProgress, studyPackFor, workspaceProgress, type StudyActivity } from './lib/studyProgress'
import type { StudyWorkspace } from './lib/workspaces'

export function ProgressPage({ workspace, courses, activity, onOpenMaterial }: {
  workspace: StudyWorkspace
  courses: Course[]
  activity: StudyActivity
  onOpenMaterial: (courseId: string, materialId: string) => void
}) {
  const progress = workspaceProgress(courses, activity)
  return <section className="page-grid progress-page">
    <div className="progress-intro"><div className="progress-intro-icon">{workspace.emoji}</div><div><p className="eyebrow">Progreso de este espacio</p><h2>{workspace.name}</h2><p>Tu avance aquí es independiente de los otros espacios.</p></div><div className="progress-overall"><strong>{progress.percent}%</strong><span>de tu material recorrido</span></div></div>
    <div className="progress-main-track"><span style={{ width: `${progress.percent}%` }}/></div>
    <div className="stats-grid"><div className="stat-card"><p>Cursos</p><strong>{courses.length}</strong><small>en este espacio</small></div><div className="stat-card"><p>Materiales iniciados</p><strong>{progress.started}/{progress.materials}</strong><small>resumen abierto</small></div><div className="stat-card"><p>Tarjetas repasadas</p><strong>{progress.reviewedCards}</strong><small>flashcards vistas</small></div><div className="stat-card"><p>Preguntas acertadas</p><strong>{progress.correct}/{progress.answered}</strong><small>quiz de práctica</small></div></div>
    {courses.length ? <div className="progress-course-list">{courses.map(course => {
      const details = workspaceProgress([course], activity)
      return <article className="panel progress-course" key={course.id}>
        <div className="progress-course-head"><div><span className="progress-course-emoji">{course.emoji}</span><div><h3>{course.name}</h3><p>{details.started}/{details.materials} materiales iniciados</p></div></div><strong>{details.percent}%</strong></div>
        <div className="progress-course-track"><span style={{ width: `${details.percent}%` }}/></div>
        {course.materials.length > 0 && <div className="progress-material-list">{course.materials.map(material => {
          const percent = materialProgress(studyPackFor(material), activity[material.id])
          return <button key={material.id} onClick={() => onOpenMaterial(course.id, material.id)}><span>{material.title}</span><span>{percent}% ↗</span></button>
        })}</div>}
      </article>
    })}</div> : <div className="panel progress-empty"><span>✦</span><h3>Este espacio comienza contigo</h3><p>Agrega un curso y sus materiales. Aquí verás su progreso sin mezclarlo con los demás espacios.</p></div>}
    <p className="progress-explainer">El avance cuenta el resumen abierto, las flashcards reveladas y las preguntas respondidas de cada material. Si mueves un curso a otro espacio, su avance lo acompaña.</p>
  </section>
}
