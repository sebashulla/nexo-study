import { useState } from 'react'
import type { Course, SavedSolution } from './types'
import { callAI } from './lib/aiClient'
import { contextForQuestion } from './lib/learningContext'
import { searchRemoteContext } from './lib/learningRepository'
import { ChatComposer } from './ChatComposer'
import { ResponseRenderer } from './ResponseRenderer'
import { masterySummary, type LearningMemory } from './lib/learningState'
import { workspaceProgress, type StudyActivity } from './lib/studyProgress'
import { recentMaterial, weakConceptsFor } from './lib/productIntelligence'

type CourseSource = { materialId: string; materialTitle: string; pageStart: number; pageEnd: number }
type CourseTurn = { question: string; answer: string; sources: CourseSource[] }

export function CourseAiPage({ course, memory, activity, seed, onOpenSource }: { course: Course; memory: LearningMemory; activity: StudyActivity; seed?: { solution: SavedSolution; question: string }; onOpenSource: (materialId: string, page: number) => void }) {
  const [question, setQuestion] = useState(seed?.question ?? '')
  const [turns, setTurns] = useState<CourseTurn[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const available = Boolean(seed) || course.materials.some(material => Boolean(material.text.trim() || material.chunks?.length || material.analysisStatus === 'ready' || material.analysisStatus === 'partial'))
  const weak = weakConceptsFor(course, memory, 1)[0]
  const recent = recentMaterial(course, activity)
  const unpracticed = course.materials.find(material => !Object.keys(activity[material.id]?.answers ?? {}).length &&
    !activity[material.id]?.flashcardsSeen?.length)
  const suggestions = [
    weak ? { label: `Repasar ${weak.label}`, prompt: `Ayúdame a repasar ${weak.label} con ejemplos de este curso.` } : null,
    unpracticed ? { label: `Practicar ${unpracticed.title}`, prompt: `Hazme 10 preguntas breves para practicar ${unpracticed.title}.` } : null,
    recent ? { label: `Explícame una idea de ${recent.title}`, prompt: `Explícame un concepto importante de ${recent.title} con su referencia de página.` } : null,
    course.materials.some(material => activity[material.id]?.lastStudiedAt) ? { label: 'Resume mi actividad reciente', prompt: 'Resume lo que he estudiado recientemente en este curso, usando solo la actividad registrada y los materiales disponibles.' } : null,
  ].filter((item): item is { label: string; prompt: string } => Boolean(item))

  const send = async () => {
    const text = question.trim()
    if (!text || !available || busy) return
    const local = contextForQuestion(text, course.materials.filter(material => material.processingStatus !== 'failed'))
    const previous = turns[turns.length - 1]
    const mastery = masterySummary(memory, course.materials.map(material => material.id))
    const progress = workspaceProgress([course], activity)
    const academicContext = `Actividad del curso: ${progress.percent}%. Dominio estimado: ${mastery.sufficient ? `${mastery.percent}%` : 'sin datos suficientes'}. Conceptos por reforzar: ${weakConceptsFor(course, memory).map(item => item.label).join(', ') || 'aún no identificados'}. Actividad reciente: ${course.materials.filter(material => activity[material.id]?.lastStudiedAt).map(material => `${material.title}: ${activity[material.id].lastStudiedAt}`).join('; ') || 'sin actividad registrada'}. Estos datos describen únicamente la práctica académica.`
    setBusy(true); setError('')
    try {
      const remote = await searchRemoteContext(course, text).catch(() => local)
      const retrieved = remote.context ? remote : local
      if (!retrieved.context && !seed) { setError('Nexo todavía no tiene fragmentos preparados para responder sobre este curso.'); return }
      const answer = await callAI({ task: 'solve', question: text, category: course.name, courseId: course.id,
        context: `Curso: ${course.name}. Contesta con base en los fragmentos recuperados. Si no hay evidencia, dilo y no inventes fuentes. Cita material y página cuando corresponda.\n\n${academicContext}\n\n${seed ? `Solución guardada de Resolver (no es una fuente PDF):\nPregunta: ${seed.solution.question}\nRespuesta: ${seed.solution.answer.slice(0, 10000)}\n\n` : ''}${retrieved.context}${previous ? `\n\nÚltimo intercambio:\n${previous.question}\n${previous.answer.slice(0, 1200)}` : ''}` })
      setTurns(current => [...current, { question: text, answer, sources: retrieved.sources }])
      setQuestion('')
    } catch { setError('Nexo tuvo un problema al responder. Tu pregunta sigue aquí para volver a intentarlo.') }
    finally { setBusy(false) }
  }

  return <section className="course-ai-page"><div className="course-ai-intro"><p className="eyebrow">Nexo IA · {course.name}</p><h3>Pregunta sobre todo el curso</h3><p>Nexo busca los fragmentos relevantes de tus materiales y conserva la referencia de origen.</p>{available && suggestions.length > 0 && <div className="course-ai-suggestions">{suggestions.map(item => <button key={item.label} className="secondary" onClick={() => setQuestion(item.prompt)}>{item.label} →</button>)}</div>}</div>
    <div className="course-ai-thread">{seed && <p className="chat-page-context">Contexto: solución guardada · {seed.solution.question.slice(0, 160)}</p>}{turns.length ? turns.map((turn, index) => <article key={index}><div className="material-chat-question">{turn.question}</div><div className="material-chat-answer"><ResponseRenderer text={turn.answer}/><div className="material-chat-sources">{turn.sources.map((source, i) => <button key={i} onClick={() => onOpenSource(source.materialId, source.pageStart)}>{source.materialTitle} · página {source.pageStart}</button>)}</div></div></article>) : <div className="course-ai-empty"><strong>{available ? '¿Qué te gustaría comprender mejor?' : 'Añade un material para conversar con Nexo sobre este curso.'}</strong><p>{available ? 'Puedes relacionar ideas de varias clases sin volver a explicar qué documentos estás estudiando.' : 'Después de cargarlo, Nexo podrá buscar dentro de él y citar las páginas relevantes.'}</p></div>}{busy && <p role="status">Nexo está revisando los materiales relevantes…</p>}</div>
    <ChatComposer className="course-ai-compose" value={question} onChange={setQuestion} onSend={() => void send()} label="Preguntar sobre el curso" placeholder="Pregunta a Nexo sobre este curso…" busy={busy} disabled={!available}>{error && <p role="alert">{error}</p>}</ChatComposer>
  </section>
}
