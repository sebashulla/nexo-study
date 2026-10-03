import { useEffect, useRef, useState } from 'react'
import type { Course, SavedSolution } from './types'
import { aiErrorMessage, callAI } from './lib/aiClient'
import { contextForQuestion } from './lib/learningContext'
import { searchRemoteContext } from './lib/learningRepository'
import { ChatComposer } from './ChatComposer'
import { ResponseRenderer } from './ResponseRenderer'
import { type LearningMemory } from './lib/learningState'
import { type StudyActivity } from './lib/studyProgress'
import { recentMaterial, weakConceptsFor } from './lib/productIntelligence'

import { conversationScopeKey } from './lib/conversationTypes'
import { useConversationDraft } from './hooks/useConversationDraft'
import { useConversation } from './hooks/useConversation'
import { ConversationTools, EarlierMessages } from './ConversationTools'
import { buildMemoryContext, matchQuestionConcept } from './lib/learningMemory'
import { getCourseTopics, getCourseLearningSummary, makeEvidence, queueEvidence } from './lib/learningGraphRepository'

type CourseSource = { materialId: string; materialTitle: string; pageStart: number; pageEnd: number }
type CourseTurn = { question: string; answer: string; sources: CourseSource[]; id: string; concept?: string }

export function CourseAiPage({ course, workspaceId, initialThreadId, memory, activity, seed, practiceSeed, onPractice, onOpenSource }: { course: Course; workspaceId: string; initialThreadId?: string; practiceSeed?: string; onPractice?: (question: string, answer: string, materialId?: string, concept?: string) => void; memory: LearningMemory; activity: StudyActivity; seed?: { solution: SavedSolution; question: string }; onOpenSource: (materialId: string, page: number) => void }) {
  const conversation = useConversation({ scope: 'course', workspaceId, courseId: course.id }, initialThreadId, !!practiceSeed)
  const [question, setQuestion] = useConversationDraft(conversation.userId, conversationScopeKey(conversation.scope), practiceSeed ? 'Ayúdame a entender este error.' : seed?.question ?? '')
  const turns: CourseTurn[] = conversation.messages.filter(item => item.role === 'assistant').map(message => {
    const previous = conversation.messages.slice(0, conversation.messages.indexOf(message)).reverse().find(item => item.role === 'user')
    return { question: previous?.content ?? '', answer: message.content, sources: message.metadata.sources ?? [], id: message.id, concept: message.metadata.concept }
  })
  const lastMessage = conversation.messages[conversation.messages.length - 1]
  const unanswered = lastMessage?.role === 'user' ? lastMessage : undefined
  const threadRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!lastMessage) return
    const frame = requestAnimationFrame(() => {
      const list = threadRef.current
      if (!list) return
      if (matchMedia('(max-width: 700px)').matches) list.closest('.course-ai-page')?.scrollIntoView({ block: 'start', behavior: 'instant' })
      list.scrollTo({ top: list.scrollHeight, behavior: 'instant' })
    })
    return () => cancelAnimationFrame(frame)
  }, [lastMessage?.id])
  const previousSelection = useRef(conversation.activeId)
  const [failedMessage, setFailedMessage] = useState<{ id: string; threadId: string; text: string }>()
  const [topicResult, setTopicResult] = useState<Awaited<ReturnType<typeof getCourseTopics>>>()
  useEffect(() => { let live = true; void getCourseTopics(conversation.userId, course.id).then(result => { if (live) setTopicResult(result) }).catch(() => {}); return () => { live = false } }, [conversation.userId, course.id])
  const graphCourse = topicResult ? { ...course, materials: course.materials.map(material => ({ ...material, topics: topicResult.topics.filter(topic => topic.materialId === material.id) })) } : course
  const summary = getCourseLearningSummary(memory, graphCourse)
  useEffect(() => { if (previousSelection.current !== conversation.activeId && !conversation.activeId) { setQuestion(practiceSeed ? 'Ayúdame a entender este error.' : seed?.question ?? ''); setFailedMessage(undefined) } previousSelection.current = conversation.activeId }, [conversation.activeId])

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
    if (!text || !available || busy || conversation.loading) return
    const local = contextForQuestion(text, course.materials.filter(material => material.processingStatus !== 'failed'))
    setBusy(true); setError('')
    try {
      const remote = await searchRemoteContext(course, text).catch(() => local)
      const retrieved = remote.context ? remote : local
      if (!retrieved.context && !seed) { setError('Nexo todavía no tiene fragmentos preparados para responder sobre este curso.'); return }
      const message = failedMessage?.text === text ? failedMessage : { ...conversation.append('user', text, { practiceContext: practiceSeed }), text }
      setFailedMessage(message)
      const answer = await callAI({ task: 'solve', question: text, category: course.name, courseId: course.id,
        context: buildMemoryContext({ course, memory, messages: conversation.messages,
          retrieval: retrieved.context, seed: practiceSeed ?? conversation.messages.find(item => item.metadata.practiceContext)?.metadata.practiceContext ?? (seed ? `Solución guardada (no es fuente PDF): ${seed.solution.question}\n${seed.solution.answer}` : '') }) })
      conversation.append('assistant', answer, { sources: retrieved.sources, concept: matchQuestionConcept(text, graphCourse)?.label }, [], message.threadId)
      setFailedMessage(undefined)
      const match = matchQuestionConcept(text, graphCourse)
      if (match) {
        await conversation.sync()
        queueEvidence(conversation.userId, { ...makeEvidence(course.id, match.materialId, match.label, 'question', 'chat', message.id), threadId: message.threadId, messageId: message.id })
      }
      setQuestion('')
    } catch (cause) { setError(aiErrorMessage(cause)) }
    finally { setBusy(false) }
  }

  return <section className="course-ai-page"><details className="course-ai-intro" open={!conversation.messages.length}><summary className="eyebrow">Nexo IA · {course.name}</summary><h3>Pregunta sobre todo el curso</h3><p>Nexo busca los fragmentos relevantes de tus materiales y conserva la referencia de origen.</p><p className="utility-note">{course.materials.length} materiales · {summary.concepts} conceptos detectados · {summary.topics} temas{topicResult?.truncated ? " · primeros 200 temas cargados" : ""}</p>{!summary.weak.length && <p className="utility-note">Necesito un poco más de práctica para detectar tus puntos débiles.</p>}{available && suggestions.length > 0 && <div className="course-ai-suggestions">{suggestions.map(item => <button key={item.label} className="secondary" onClick={() => setQuestion(item.prompt)}>{item.label} →</button>)}</div>}</details>
    <ConversationTools conversation={conversation} busy={busy} context={course.name}/><div className="course-ai-thread" ref={threadRef}><EarlierMessages conversation={conversation}/>{practiceSeed && <p className="chat-page-context">Contexto: error de práctica · {practiceSeed.slice(0, 240)}</p>}{seed && <p className="chat-page-context">Contexto: solución guardada · {seed.solution.question.slice(0, 160)}</p>}{turns.length ? turns.map(turn => <article key={turn.id}><div className="material-chat-question">{turn.question}</div><div className="material-chat-answer"><ResponseRenderer text={turn.answer}/><div className="material-chat-sources">{turn.sources.map((source, i) => <button key={i} onClick={() => onOpenSource(source.materialId, source.pageStart)}>{source.materialTitle} · página {source.pageStart}</button>)}</div>{onPractice && <button className="text-button chat-practice" onClick={() => onPractice(turn.question, turn.answer, turn.sources[0]?.materialId, turn.concept)}>Practicar esto</button>}</div></article>) : <div className="course-ai-empty"><strong>{available ? '¿Qué te gustaría comprender mejor?' : 'Añade un material para conversar con Nexo sobre este curso.'}</strong><p>{available ? 'Puedes relacionar ideas de varias clases sin volver a explicar qué documentos estás estudiando.' : 'Después de cargarlo, Nexo podrá buscar dentro de él y citar las páginas relevantes.'}</p></div>}{unanswered && <div className="material-chat-question">{unanswered.content}</div>}{busy && <p role="status">Nexo está revisando los materiales relevantes…</p>}</div>
    <ChatComposer className="course-ai-compose" value={question} onChange={setQuestion} onSend={() => void send()} label="Preguntar sobre el curso" placeholder="Pregunta a Nexo sobre este curso…" busy={busy} disabled={!available}>{error && <div role="alert"><p>{error}</p><button className="text-button" onClick={() => void send()}>Reintentar</button></div>}</ChatComposer>
  </section>
}
