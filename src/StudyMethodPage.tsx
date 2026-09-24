import { useState } from 'react'
import type { Course, Material, StudyArtifactType } from './types'
import type { MaterialStudyMode } from './lib/router'
import type { RecallRating } from './lib/learningState'
import { callAI } from './lib/aiClient'
import { ExamRunner } from './ExamRunner'
import { chunksForMaterial, topicsForMaterial } from './lib/learningContext'
import { ResponseRenderer } from './ResponseRenderer'

type RecordValue = Record<string, unknown>
type WrittenQuestion = { question: string; keyPoints: string[]; sourcePage?: number; concept: string }
type BlankItem = { sentence: string; answer: string; sourcePage?: number; concept: string }

function object(value: unknown): RecordValue | null { return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : null }
function string(value: unknown) { return typeof value === 'string' ? value : '' }
function page(value: unknown) { return typeof value === 'number' && value > 0 ? value : undefined }
function writtenFrom(payload: unknown): WrittenQuestion[] {
  const items = object(payload)?.questions
  return Array.isArray(items) ? items.flatMap(item => {
    const value = object(item)
    return value && string(value.question) && Array.isArray(value.keyPoints) ? [{ question: string(value.question), keyPoints: value.keyPoints.filter((point): point is string => typeof point === 'string'), sourcePage: page(value.sourcePage), concept: string(value.concept) }] : []
  }) : []
}
function blanksFrom(payload: unknown): BlankItem[] {
  const items = object(payload)?.items
  return Array.isArray(items) ? items.flatMap(item => {
    const value = object(item)
    return value && string(value.sentence) && string(value.answer) ? [{ sentence: string(value.sentence), answer: string(value.answer), sourcePage: page(value.sourcePage), concept: string(value.concept) }] : []
  }) : []
}
function normalized(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ') }

export function StudyMethodPage({ course, material, mode, onBack, onGenerate, onRecall, onPractice }: {
  course: Course
  material: Material
  mode: MaterialStudyMode
  onBack: () => void
  onGenerate: (type: Exclude<StudyArtifactType, 'summary' | 'exam'>, force?: boolean) => void
  onRecall: (concept: string, rating: RecallRating) => void
  onPractice: (type: 'written_questions' | 'fill_blanks' | 'exam', index: number, correct: boolean) => void
}) {
  const [index, setIndex] = useState(0)
  const [answer, setAnswer] = useState('')
  const [feedback, setFeedback] = useState('')
  const [busy, setBusy] = useState(false)
  const [checked, setChecked] = useState(false)
  const artifactType = mode === 'written' ? 'written_questions' : mode === 'fill-blanks' ? 'fill_blanks' : mode === 'notes' ? 'notes' : null
  const artifact = material.artifacts?.filter(item => item.type === artifactType).sort((a, b) => b.version - a.version)[0]
  const questions = writtenFrom(artifact?.payload)
  const blanks = blanksFrom(artifact?.payload)
  const topics = material.topics?.length ? material.topics : topicsForMaterial(material, chunksForMaterial(material))
  const notes = object(artifact?.payload)

  const next = (length: number) => { setIndex(current => (current + 1) % length); setAnswer(''); setFeedback(''); setChecked(false) }
  const reviewWritten = async (question: WrittenQuestion) => {
    if (!answer.trim() || busy) return
    setBusy(true); setFeedback('')
    try {
      const result = await callAI({ task: 'solve', question: `Pregunta abierta: ${question.question}\nRespuesta del estudiante: ${answer.trim()}\nExplica qué conceptos cubrió, cuáles faltan y si hay un posible error. No asignes una nota arbitraria.`,
        category: course.name, courseId: course.id, materialId: material.id,
        context: `Material ${material.title}, página ${question.sourcePage ?? 'sin referencia'}. Puntos de referencia: ${question.keyPoints.join('; ')}` })
      setFeedback(result)
    } catch { setFeedback('Nexo no pudo revisar esta respuesta ahora. Tu texto sigue disponible para reintentar.') }
    finally { setBusy(false) }
  }

  const reviewLearn = async () => {
    const topic = topics[index]
    if (!topic || !answer.trim() || busy) return
    setBusy(true); setFeedback('')
    try {
      const result = await callAI({ task: 'solve', category: course.name, courseId: course.id, materialId: material.id,
        question: `Estoy aprendiendo el concepto "${topic.title}". Mi explicación: ${answer.trim()}\nDime qué entendí bien, qué idea importante falta y hazme una pregunta corta para comprobar mi comprensión. Evita calificaciones arbitrarias.`,
        context: `Material ${material.title}, páginas ${topic.pageStart ?? 'sin referencia'}${topic.pageEnd && topic.pageEnd !== topic.pageStart ? `–${topic.pageEnd}` : ''}. Idea del material: ${topic.summary}` })
      setFeedback(result); setChecked(true)
    } catch { setFeedback('Nexo no pudo revisar tu explicación. Tu respuesta sigue aquí para reintentar.') }
    finally { setBusy(false) }
  }

  const title = ({ learn: 'Aprender con Nexo', written: 'Examen escrito', 'fill-blanks': 'Completar espacios', notes: 'Apuntes inteligentes', exam: 'Simulacro', flashcards: 'Flashcards', 'multiple-choice': 'Opción múltiple' } as const)[mode]
  const gate = (name: string, type: Exclude<StudyArtifactType, 'summary' | 'exam'>) => <div className="artifact-gate"><span>✦</span><h3>{artifact?.status === 'processing' ? `Nexo prepara ${name}` : artifact?.status === 'failed' ? `No pudimos preparar ${name}` : `Prepara ${name} cuando lo necesites`}</h3><p>Se generará a partir de fragmentos de este material y quedará guardado para la próxima vez.</p>{artifact?.status !== 'processing' && <button className="primary" onClick={() => onGenerate(type)}>{artifact?.status === 'failed' ? 'Reintentar' : `Generar ${name} con Nexo`}</button>}</div>

  return <section className="study-method-page"><header><button className="text-button" onClick={onBack}>← Volver al material</button><p className="eyebrow">{course.name} · {material.title}</p><h2>{title}</h2>{artifactType && artifact?.status === 'ready' && <button className="secondary" onClick={() => onGenerate(artifactType, true)}>Regenerar con Nexo</button>}</header>
    {mode === 'learn' && (topics.length ? <div className="guided-lesson"><p className="counter">Concepto {index + 1} de {topics.length}{topics[index].pageStart ? ` · Página ${topics[index].pageStart}` : ''}</p><h3>{topics[index].title}</h3><p>{topics[index].summary}</p><label>Explícalo con tus palabras<textarea rows={4} value={answer} onChange={event => setAnswer(event.target.value)} placeholder="¿Qué entendiste de esta idea?"/></label>{!checked ? <><button className="primary" disabled={!answer.trim() || busy} onClick={() => void reviewLearn()}>{busy ? 'Revisando…' : 'Revisar con Nexo'}</button>{feedback && <p role="alert">{feedback}</p>}</> : <div className="guided-feedback"><strong>Orientación de Nexo</strong><ResponseRenderer text={feedback}/><div><button className="secondary" onClick={() => { onRecall(topics[index].title, 'again'); next(topics.length) }}>Necesito repasar</button><button className="primary" onClick={() => { onRecall(topics[index].title, 'good'); next(topics.length) }}>Lo comprendí · siguiente</button></div></div>}</div> : <p>Este material aún no tiene temas listos para un recorrido guiado.</p>)}
    {mode === 'written' && (artifact?.status !== 'ready' ? gate('preguntas escritas', 'written_questions') : questions.length ? <div className="guided-lesson"><p className="counter">Pregunta {index + 1} de {questions.length}{questions[index].sourcePage ? ` · Página ${questions[index].sourcePage}` : ''}</p><h3>{questions[index].question}</h3><label>Tu respuesta<textarea rows={8} value={answer} onChange={event => setAnswer(event.target.value)} placeholder="Desarrolla tu idea y justifícala con el material…"/></label><button className="primary" disabled={!answer.trim() || busy} onClick={() => void reviewWritten(questions[index])}>{busy ? 'Revisando…' : 'Revisar con Nexo'}</button>{feedback && <div className="guided-feedback"><ResponseRenderer text={feedback}/><div><button className="secondary" onClick={() => { onRecall(questions[index].concept || questions[index].question, 'again'); onPractice('written_questions', index, false); next(questions.length) }}>Necesito repasar</button><button className="primary" onClick={() => { onRecall(questions[index].concept || questions[index].question, 'good'); onPractice('written_questions', index, true); next(questions.length) }}>Siguiente pregunta</button></div></div>}</div> : gate('preguntas escritas', 'written_questions'))}
    {mode === 'fill-blanks' && (artifact?.status !== 'ready' ? gate('ejercicios de completar', 'fill_blanks') : blanks.length ? <div className="guided-lesson"><p className="counter">Ejercicio {index + 1} de {blanks.length}{blanks[index].sourcePage ? ` · Página ${blanks[index].sourcePage}` : ''}</p><h3>{blanks[index].sentence}</h3><label>Completa el espacio<input value={answer} onChange={event => setAnswer(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') setChecked(true) }} /></label><button className="primary" disabled={!answer.trim() || checked} onClick={() => setChecked(true)}>Comprobar</button>{checked && <div className="guided-feedback"><strong>{normalized(answer) === normalized(blanks[index].answer) ? 'Correcto' : 'Revisa esta idea'}</strong><p>Respuesta esperada: {blanks[index].answer}</p><button className="primary" onClick={() => { onRecall(blanks[index].concept || blanks[index].answer, normalized(answer) === normalized(blanks[index].answer) ? 'good' : 'again'); onPractice('fill_blanks', index, normalized(answer) === normalized(blanks[index].answer)); next(blanks.length) }}>Siguiente →</button></div>}</div> : gate('ejercicios de completar', 'fill_blanks'))}
    {mode === 'notes' && (artifact?.status !== 'ready' ? gate('apuntes', 'notes') : notes ? <div className="structured-notes"><section><h3>Resumen</h3><p>{string(notes.summary)}</p></section>{([['essentialConcepts', 'Conceptos esenciales'], ['relationships', 'Relaciones'], ['examples', 'Ejemplos'], ['importantData', 'Datos importantes'], ['selfQuestions', 'Preguntas que deberías poder responder']] as const).map(([key, label]) => <section key={key}><h3>{label}</h3><ul>{Array.isArray(notes[key]) && notes[key].map((item, i) => <li key={i}>{string(item)}</li>)}</ul></section>)}</div> : gate('apuntes', 'notes'))}
    {mode === 'exam' && <ExamRunner course={course} material={material} onGenerate={onGenerate} onRecall={onRecall} onPractice={onPractice} />}
  </section>
}
