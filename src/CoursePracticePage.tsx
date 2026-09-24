import { useState } from 'react'
import type { Course, StudySession } from './types'
import type { MaterialStudyMode } from './lib/router'
import type { SessionDuration, SessionObjective } from './lib/studySessions'

const objectives: { value: SessionObjective; label: string }[] = [
  { value: 'quick', label: 'Repaso rápido' }, { value: 'exam', label: 'Examen' },
  { value: 'weak', label: 'Temas débiles' }, { value: 'all', label: 'Todo el curso' },
]
const activityLabels: Record<string, string> = {
  learn: 'Aprender con Nexo', 'multiple-choice': 'Opción múltiple', flashcards: 'Flashcards', 'review-errors': 'Revisar errores',
}

export function CoursePracticePage({ course, sessions, onPrepare, onComplete, onOpenActivity }: {
  course: Course
  sessions: StudySession[]
  onPrepare: (duration: SessionDuration, objective: SessionObjective) => void
  onComplete: (sessionId: string, step: number) => void
  onOpenActivity: (sessionId: string, materialId: string, mode: MaterialStudyMode) => void
}) {
  const [duration, setDuration] = useState<SessionDuration>(30)
  const [objective, setObjective] = useState<SessionObjective>('exam')
  const active = sessions.find(session => session.status !== 'completed')
  return <div className="course-practice"><div className="course-practice-intro"><p className="eyebrow">Estudio con propósito</p><h3>Prepárame para el examen</h3><p>Elige tiempo y objetivo. Nexo combina tus materiales con las respuestas que necesitas reforzar.</p></div>
    <div className="course-practice-controls"><div><strong>Tiempo disponible</strong><div className="practice-options">{([15, 30, 45] as SessionDuration[]).map(value => <button key={value} className={duration === value ? 'active' : ''} onClick={() => setDuration(value)}>{value} min</button>)}</div></div><div><strong>Objetivo</strong><div className="practice-options">{objectives.map(option => <button key={option.value} className={objective === option.value ? 'active' : ''} onClick={() => setObjective(option.value)}>{option.label}</button>)}</div></div><button className="primary" disabled={!course.materials.length || Boolean(active)} onClick={() => onPrepare(duration, objective)}>{active ? 'Continúa tu sesión actual' : 'Preparar sesión'}</button></div>
    {active ? <section className="study-session-plan"><div><p className="eyebrow">Sesión de {active.durationMinutes} min · {active.status === 'planned' ? 'Planificada' : 'En curso'}</p><h3>{objectives.find(item => item.value === active.objective)?.label ?? active.objective}</h3><p>{active.plan.filter((_, index) => active.results[String(index)] === 1).length}/{active.plan.length} actividades terminadas</p></div><ol>{active.plan.map((step, index) => <li key={index}><div><span>{String(index + 1).padStart(2, '0')}</span><strong>{activityLabels[step.type] ?? step.type}</strong><small>{step.minutes} min · {course.materials.find(material => material.id === step.materialId)?.title ?? 'Curso'}</small></div><div><button className="secondary" disabled={!step.materialId} onClick={() => step.materialId && onOpenActivity(active.id, step.materialId, step.type === 'review-errors' ? 'flashcards' : step.type as MaterialStudyMode)}>Abrir</button><button className="secondary" disabled={active.results[String(index)] === 1} onClick={() => onComplete(active.id, index)}>{active.results[String(index)] === 1 ? 'Hecho ✓' : 'Marcar hecho'}</button></div></li>)}</ol></section> : <div className="course-section-empty"><h3>Una sesión a tu ritmo</h3><p>{course.materials.length ? 'Selecciona el tiempo que tienes hoy. Puedes continuar una sesión sin temporizador.' : 'Agrega un material para preparar tu primera sesión.'}</p></div>}
    {sessions.some(session => session.status === 'completed') && <div className="course-session-history"><h3>Sesiones completadas</h3>{sessions.filter(session => session.status === 'completed').slice(0, 5).map(session => <p key={session.id}>{session.durationMinutes} min · {objectives.find(item => item.value === session.objective)?.label ?? session.objective} · {new Date(session.completedAt || session.createdAt).toLocaleDateString('es-PE')}</p>)}</div>}
  </div>
}
