import type { Course, StudySession } from './types'
import { materialProgress, studyPackFor, workspaceProgress, type StudyActivity } from './lib/studyProgress'
import { masterySummary, type LearningMemory } from './lib/learningState'
import type { StudyWorkspace } from './lib/workspaces'

export function ProgressPage({ workspace, courses, activity, memory, sessions = [], onOpenMaterial }: {
  workspace: StudyWorkspace
  courses: Course[]
  activity: StudyActivity
  memory: LearningMemory
  sessions?: StudySession[]
  onOpenMaterial: (courseId: string, materialId: string) => void
}) {
  const progress = workspaceProgress(courses, activity)
  const mastery = masterySummary(memory, courses.flatMap(course => course.materials.map(material => material.id)))
  return <section className="page-grid progress-page">
    <div className="progress-intro"><div className="progress-intro-icon">{workspace.emoji}</div><div><p className="eyebrow">Progreso académico</p><h2>{workspace.name}</h2><p>La actividad y el dominio se muestran por separado.</p></div><div className="progress-overall"><strong>{progress.percent}%</strong><span>de actividad registrada</span></div></div>
    <div className="progress-main-track"><span style={{ width: `${progress.percent}%` }}/></div>
    <div className="stats-grid"><div className="stat-card"><p>Dominio estimado</p><strong>{mastery.percent}%</strong><small>{mastery.concepts} conceptos practicados</small></div><div className="stat-card"><p>Materiales iniciados</p><strong>{progress.started}/{progress.materials}</strong><small>actividad de estudio</small></div><div className="stat-card"><p>Tarjetas repasadas</p><strong>{progress.reviewedCards}</strong><small>flashcards vistas</small></div><div className="stat-card"><p>Preguntas acertadas</p><strong>{progress.correct}/{progress.answered}</strong><small>quiz y ejercicios</small></div></div>
    <div className="panel progress-session-summary"><strong>{sessions.filter(session => session.status === 'completed').length} sesiones completadas</strong><span>{progress.sessionSteps} actividades de sesión terminadas en este espacio</span></div>
    {courses.length ? <div className="progress-course-list">{courses.map(course => {
      const details = workspaceProgress([course], activity)
      const courseMastery = masterySummary(memory, course.materials.map(material => material.id))
      return <article className="panel progress-course" key={course.id}>
        <div className="progress-course-head"><div><span className="progress-course-emoji">{course.emoji}</span><div><h3>{course.name}</h3><p>{details.started}/{details.materials} materiales iniciados · dominio {courseMastery.percent}%</p></div></div><strong>{details.percent}% actividad</strong></div>
        <div className="progress-course-track"><span style={{ width: `${details.percent}%` }}/></div>
        {course.materials.length > 0 && <div className="progress-material-list">{course.materials.map(material => {
          const percent = materialProgress(studyPackFor(material), activity[material.id], material)
          return <button key={material.id} onClick={() => onOpenMaterial(course.id, material.id)}><span>{material.title}</span><span>{percent}% ↗</span></button>
        })}</div>}
      </article>
    })}</div> : <div className="panel progress-empty"><span>✦</span><h3>Este espacio comienza contigo</h3><p>Agrega un curso y sus materiales. Aquí verás su progreso sin mezclarlo con los demás espacios.</p></div>}
    <p className="progress-explainer">Actividad: resumen abierto, tarjetas vistas, preguntas respondidas y ejercicios completados. Dominio estimado: calidad y repetición de las respuestas por concepto. Las sesiones se muestran por separado. Si mueves un curso a otro espacio, estos indicadores lo acompañan.</p>
  </section>
}
