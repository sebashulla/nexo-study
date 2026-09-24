import { useState } from 'react'
import type { Course } from './types'
import { callAI } from './lib/aiClient'
import { contextForQuestion } from './lib/learningContext'
import { searchRemoteContext } from './lib/learningRepository'
import { ResponseRenderer } from './ResponseRenderer'
import { masterySummary, type LearningMemory } from './lib/learningState'
import { workspaceProgress, type StudyActivity } from './lib/studyProgress'

type CourseSource = { materialId: string; materialTitle: string; pageStart: number; pageEnd: number }
type CourseTurn = { question: string; answer: string; sources: CourseSource[] }

export function CourseAiPage({ course, memory, activity, onOpenSource }: { course: Course; memory: LearningMemory; activity: StudyActivity; onOpenSource: (materialId: string, page: number) => void }) {
  const [question, setQuestion] = useState('')
  const [turns, setTurns] = useState<CourseTurn[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const available = course.materials.some(material => Boolean(material.text.trim() || material.chunks?.length || material.analysisStatus === 'ready' || material.analysisStatus === 'partial'))
  const weak = masterySummary(memory, course.materials.map(material => material.id)).weak[0]
  const unpracticed = course.materials.find(material => !Object.keys(activity[material.id]?.answers ?? {}).length &&
    !activity[material.id]?.flashcardsSeen?.length)
  const suggestions = [
    weak ? { label: `Repasar ${weak.label}`, prompt: `Ayúdame a repasar ${weak.label} con ejemplos de este curso.` } : null,
    unpracticed ? { label: `Practicar ${unpracticed.title}`, prompt: `Hazme 10 preguntas breves para practicar ${unpracticed.title}.` } : null,
  ].filter((item): item is { label: string; prompt: string } => Boolean(item))

  const send = async () => {
    const text = question.trim()
    if (!text || !available || busy) return
    const local = contextForQuestion(text, course.materials.filter(material => material.processingStatus !== 'failed'))
    const previous = turns[turns.length - 1]
    const mastery = masterySummary(memory, course.materials.map(material => material.id))
    const progress = workspaceProgress([course], activity)
    const academicContext = `Actividad del curso: ${progress.percent}%. Dominio estimado: ${mastery.percent}%. Conceptos por reforzar: ${mastery.weak.slice(0, 5).map(item => item.label).join(', ') || 'aún no identificados'}. Estos datos describen únicamente la práctica académica.`
    setBusy(true); setError('')
    try {
      const remote = await searchRemoteContext(course, text).catch(() => local)
      const retrieved = remote.context ? remote : local
      if (!retrieved.context) { setError('Nexo todavía no tiene fragmentos preparados para responder sobre este curso.'); return }
      const answer = await callAI({ task: 'solve', question: text, category: course.name, courseId: course.id,
        context: `Curso: ${course.name}. Contesta con base en los fragmentos recuperados. Si no hay evidencia, dilo y no inventes fuentes. Cita material y página cuando corresponda.\n\n${academicContext}\n\n${retrieved.context}${previous ? `\n\nÚltimo intercambio:\n${previous.question}\n${previous.answer.slice(0, 1200)}` : ''}` })
      setTurns(current => [...current, { question: text, answer, sources: retrieved.sources }])
      setQuestion('')
    } catch { setError('Nexo tuvo un problema al responder. Tu pregunta sigue aquí para volver a intentarlo.') }
    finally { setBusy(false) }
  }

  return <section className="course-ai-page"><div className="course-ai-intro"><p className="eyebrow">Nexo IA · {course.name}</p><h3>Pregunta sobre todo el curso</h3><p>Nexo busca los fragmentos relevantes de tus materiales y conserva la referencia de origen.</p>{available && suggestions.length > 0 && <div className="course-ai-suggestions">{suggestions.map(item => <button key={item.label} className="secondary" onClick={() => setQuestion(item.prompt)}>{item.label} →</button>)}</div>}</div>
    <div className="course-ai-thread">{turns.length ? turns.map((turn, index) => <article key={index}><div className="material-chat-question">{turn.question}</div><div className="material-chat-answer"><ResponseRenderer text={turn.answer}/><div className="material-chat-sources">{turn.sources.map((source, i) => <button key={i} onClick={() => onOpenSource(source.materialId, source.pageStart)}>{source.materialTitle} · página {source.pageStart}</button>)}</div></div></article>) : <div className="course-ai-empty"><strong>{available ? '¿Qué te gustaría comprender mejor?' : 'Añade un material para conversar con Nexo sobre este curso.'}</strong><p>{available ? 'Puedes relacionar ideas de varias clases sin volver a explicar qué documentos estás estudiando.' : 'Después de cargarlo, Nexo podrá buscar dentro de él y citar las páginas relevantes.'}</p></div>}{busy && <p role="status">Nexo está revisando los materiales relevantes…</p>}</div>
    <div className="course-ai-compose">{error && <p role="alert">{error}</p>}<textarea aria-label="Preguntar sobre el curso" rows={3} disabled={!available} value={question} onChange={event => setQuestion(event.target.value)} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); void send() } }} placeholder="Pregunta algo sobre lo que has estudiado en este curso…"/><button className="primary" disabled={!available || !question.trim() || busy} onClick={() => void send()}>Preguntar a Nexo</button></div>
  </section>
}
