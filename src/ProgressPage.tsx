import { lazy, Suspense, useState } from 'react'
import { useAuth } from './auth/AuthContext'
import { conceptStatusLabel, courseConcepts } from './lib/learningGraphRepository'
import type { LearningConcept } from './types'
const ConceptDetail = lazy(() => import('./ConceptDetail').then(module => ({ default: module.ConceptDetail })))
import type { Course, StudySession } from './types'
import { materialProgress, studyPackFor, workspaceProgress, type StudyActivity } from './lib/studyProgress'
import { masterySummary, type LearningMemory } from './lib/learningState'
import type { StudyWorkspace } from './lib/workspaces'

export function ProgressPage({ workspace, courses, activity, memory, sessions = [], onOpenMaterial, onPractice, onAsk }: {
  workspace: StudyWorkspace
  courses: Course[]
  activity: StudyActivity
  memory: LearningMemory
  sessions?: StudySession[]
  onOpenMaterial: (courseId: string, materialId: string) => void
  onPractice?: (courseId: string, materialId: string, concept?: LearningConcept) => void
  onAsk?: (course: Course, concept: LearningConcept) => void
}) {
  const { user } = useAuth()
  const [selected, setSelected] = useState<{ course: Course; concept: LearningConcept }>()
  const progress = workspaceProgress(courses, activity)
  const mastery = masterySummary(memory, courses.flatMap(course => course.materials.map(material => material.id)))
  const weak = mastery.weak.filter(concept => concept.confidence < .53).slice(0, 5)
  const recent = courses.flatMap(course => course.materials.filter(material => activity[material.id]?.lastStudiedAt)
    .map(material => ({ course, material, at: activity[material.id].lastStudiedAt ?? '' })))
    .sort((a, b) => b.at.localeCompare(a.at)).slice(0, 3)
  return <section className="page-grid progress-page">
    <div className="progress-intro"><div className="progress-intro-icon">{workspace.emoji}</div><div><p className="eyebrow">Progreso académico</p><h2>{workspace.name}</h2><p>La actividad y el dominio se muestran por separado.</p></div><div className="progress-overall"><strong>{progress.percent}%</strong><span>de actividad registrada</span></div></div>
    <div className="progress-main-track"><span style={{ width: `${progress.percent}%` }}/></div>
    {progress.started || mastery.concepts ? <div className="stats-grid"><div className="stat-card"><p>Dominio estimado</p><strong>{mastery.sufficient ? `${mastery.percent}%` : '—'}</strong><small>{mastery.sufficient ? `${mastery.concepts} conceptos practicados` : 'Sin datos suficientes · sigue practicando'}</small></div><div className="stat-card"><p>Materiales iniciados</p><strong>{progress.started}/{progress.materials}</strong><small>actividad de estudio</small></div><div className="stat-card"><p>Tarjetas repasadas</p><strong>{progress.reviewedCards}</strong><small>flashcards vistas</small></div><div className="stat-card"><p>Preguntas acertadas</p><strong>{progress.answered ? `${progress.correct}/${progress.answered}` : '—'}</strong><small>quiz y ejercicios</small></div></div> : <div className="panel progress-empty"><h3>Aún no hay suficiente actividad</h3><p>Abre un material y practica para estimar tu dominio. La actividad mide uso; el dominio mide cómo respondes.</p></div>}
    {weak.length > 0 && <section className="panel progress-focus"><p className="eyebrow">Qué reforzar ahora</p><div>{weak.map(concept => <button key={concept.key} className="secondary" onClick={() => { const course = courses.find(item => item.materials.some(material => material.id === concept.materialId)); if (course) (onPractice ?? onOpenMaterial)(course.id, concept.materialId) }}>{concept.label} · Practicar →</button>)}</div></section>}
    {recent.length > 0 && <section className="panel progress-recent"><p className="eyebrow">Actividad reciente</p><div>{recent.map(item => {
      const value = activity[item.material.id]
      const questions = Object.keys(value.answers ?? {}).length + Object.keys(value.practiceAttempts ?? {}).length
      const cards = (value.flashcardsSeen?.length ?? 0) + (value.artifactCardsSeen?.length ?? 0)
      return <button key={item.material.id} className="text-button" onClick={() => onOpenMaterial(item.course.id, item.material.id)}>{item.course.name} · {item.material.title} · {new Date(item.at).toLocaleDateString('es-PE')}{questions ? ` · ${questions} preguntas respondidas` : ''}{cards ? ` · ${cards} tarjetas repasadas` : ''} →</button>
    })}</div></section>}
    <div className="panel progress-session-summary"><strong>{sessions.filter(session => session.status === 'completed').length} sesiones completadas</strong><span>{progress.sessionSteps} actividades de sesión terminadas en este espacio</span></div>
    {courses.length ? <div className="progress-course-list">{courses.map(course => {
      const details = workspaceProgress([course], activity)
      const courseMastery = masterySummary(memory, course.materials.map(material => material.id))
      return <article className="panel progress-course" key={course.id}>
        <div className="progress-course-head"><div><span className="progress-course-emoji">{course.emoji}</span><div><h3>{course.name}</h3><p>{course.materials.length ? `${details.started}/${details.materials} materiales iniciados` : 'Agrega un material para empezar'}{courseMastery.sufficient ? ` · dominio ${courseMastery.percent}%` : ''}</p></div></div><strong>{details.percent}% actividad</strong></div>
        <div className="progress-course-track"><span style={{ width: `${details.percent}%` }}/></div>
        {course.materials.length > 0 && <div className="progress-material-list">{course.materials.map(material => {
          const percent = materialProgress(studyPackFor(material), activity[material.id], material)
          return <button key={material.id} onClick={() => onOpenMaterial(course.id, material.id)}><span>{material.title}</span><span>{percent}% ↗</span></button>
        })}</div>}
      </article>
    })}</div> : <div className="panel progress-empty"><span>✦</span><h3>Este espacio comienza contigo</h3><p>Agrega un curso y sus materiales. Aquí verás su progreso sin mezclarlo con los demás espacios.</p></div>}
    <section className="panel progress-concepts"><p className="eyebrow">Conceptos del curso</p>{courses.map(course => {
      const concepts = courseConcepts(course, memory)
      return <div key={course.id}><h3>{course.name}</h3>{concepts.length ? <div className="concept-state-list">{concepts.slice(0, 30).map(concept => <button className="secondary" key={concept.key} onClick={() => setSelected({ course, concept })}><strong>{concept.label}</strong><small>{conceptStatusLabel(concept)}</small></button>)}</div> : <p>No hay suficiente evidencia todavía. Prepara un material o practica en este curso.</p>}{concepts.length > 30 && <details><summary>{concepts.length - 30} conceptos más</summary><div className="concept-state-list">{concepts.slice(30).map(concept => <button className="secondary" key={concept.key} onClick={() => setSelected({ course, concept })}><strong>{concept.label}</strong><small>{conceptStatusLabel(concept)}</small></button>)}</div></details>}</div>
    })}</section>
    {selected && user && <Suspense fallback={<p>Cargando concepto…</p>}><ConceptDetail userId={user.id} course={selected.course} concept={memory[selected.concept.key] ?? selected.concept} onClose={() => setSelected(undefined)}
      onPractice={() => { setSelected(undefined); (onPractice ?? onOpenMaterial)(selected.course.id, selected.concept.materialId, selected.concept) }}
      onAsk={() => { setSelected(undefined); onAsk?.(selected.course, selected.concept) }}/></Suspense>}
    <p className="progress-explainer">Actividad: resumen abierto, tarjetas vistas, preguntas respondidas y ejercicios completados. Dominio estimado: calidad y repetición de las respuestas por concepto. Las sesiones se muestran por separado. Si mueves un curso a otro espacio, estos indicadores lo acompañan.</p>
  </section>
}
