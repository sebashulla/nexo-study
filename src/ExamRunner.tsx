import { useState } from 'react'
import type { Course, Material, QuizQuestion, StudyArtifactType } from './types'
import type { RecallRating } from './lib/learningState'
import { callAI } from './lib/aiClient'
import { artifactQuestions } from './lib/artifactPrompts'
import { ResponseRenderer } from './ResponseRenderer'

type Written = { question: string; keyPoints: string[]; sourcePage?: number; concept?: string }
type Blank = { sentence: string; answer: string; sourcePage?: number; concept?: string }
export type ExamItem = { kind: 'multiple_choice'; value: QuizQuestion } | { kind: 'written_questions'; value: Written } | { kind: 'fill_blanks'; value: Blank }

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}
function string(value: unknown) { return typeof value === 'string' ? value : '' }
function sourcePage(value: unknown) { return typeof value === 'number' && value > 0 ? value : undefined }
function normalize(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ') }

function latestPayload(material: Material, type: StudyArtifactType) {
  return material.artifacts?.filter(item => item.type === type && item.status === 'ready').sort((a, b) => b.version - a.version)[0]?.payload
}

function examPool(material: Material): ExamItem[] {
  const multiple = artifactQuestions(latestPayload(material, 'multiple_choice')).map(value => ({ kind: 'multiple_choice' as const, value }))
  const writtenPayload = record(latestPayload(material, 'written_questions'))?.questions
  const written: ExamItem[] = Array.isArray(writtenPayload) ? writtenPayload.flatMap(item => {
    const row = record(item)
    return row && string(row.question) && Array.isArray(row.keyPoints) ? [{ kind: 'written_questions' as const,
      value: { question: string(row.question), keyPoints: row.keyPoints.filter((point): point is string => typeof point === 'string'), sourcePage: sourcePage(row.sourcePage), concept: string(row.concept) } }] : []
  }) : []
  const blankPayload = record(latestPayload(material, 'fill_blanks'))?.items
  const blanks: ExamItem[] = Array.isArray(blankPayload) ? blankPayload.flatMap(item => {
    const row = record(item)
    return row && string(row.sentence) && string(row.answer) ? [{ kind: 'fill_blanks' as const,
      value: { sentence: string(row.sentence), answer: string(row.answer), sourcePage: sourcePage(row.sourcePage), concept: string(row.concept) } }] : []
  }) : []
  const groups: ExamItem[][] = [multiple, written, blanks]
  const mixed: ExamItem[] = []
  for (let index = 0; index < Math.max(...groups.map(group => group.length)); index += 1) {
    for (const group of groups) if (group[index]) mixed.push(group[index])
  }
  return mixed
}

function storedExam(payload: unknown): { count: 10 | 20 | 40; items: ExamItem[] } | null {
  const data = record(payload)
  if (data?.count !== 10 && data?.count !== 20 && data?.count !== 40) return null
  if (!Array.isArray(data.items)) return null
  const items: ExamItem[] = (data.items as unknown[]).flatMap((item): ExamItem[] => {
    const row = record(item)
    const value = record(row?.value)
    if (!row || !value) return []
    if (row.kind === 'multiple_choice') {
      const question = artifactQuestions({ questions: [value] })[0]
      return question ? [{ kind: 'multiple_choice' as const, value: question }] : []
    }
    if (row.kind === 'written_questions' && string(value.question) && Array.isArray(value.keyPoints))
      return [{ kind: 'written_questions' as const, value: { question: string(value.question),
        keyPoints: value.keyPoints.filter((point): point is string => typeof point === 'string'),
        sourcePage: sourcePage(value.sourcePage), concept: string(value.concept) } }]
    if (row.kind === 'fill_blanks' && string(value.sentence) && string(value.answer))
      return [{ kind: 'fill_blanks' as const, value: { sentence: string(value.sentence), answer: string(value.answer),
        sourcePage: sourcePage(value.sourcePage), concept: string(value.concept) } }]
    return []
  })
  return items.length ? { count: data.count, items } : null
}

export function ExamRunner({ course, material, onGenerate, onSaveExam, onRecall, onPractice }: {
  course: Course
  material: Material
  onGenerate: (type: Exclude<StudyArtifactType, 'summary' | 'exam'>, force?: boolean) => void
  onSaveExam: (count: 10 | 20 | 40, items: ExamItem[], force?: boolean) => void
  onRecall: (concept: string, rating: RecallRating) => void
  onPractice: (type: 'written_questions' | 'fill_blanks' | 'exam', index: number, correct: boolean) => void
}) {
  const [count, setCount] = useState<10 | 20 | 40>(10)
  const [index, setIndex] = useState(0)
  const [answer, setAnswer] = useState('')
  const [checked, setChecked] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [busy, setBusy] = useState(false)
  const [correct, setCorrect] = useState(0)
  const available = examPool(material).slice(0, count)
  const saved = material.artifacts?.filter(artifact => artifact.type === 'exam' && artifact.status === 'ready')
    .sort((a, b) => b.version - a.version).map(artifact => storedExam(artifact.payload)).find(value => value?.count === count)
  const items = saved?.items ?? []
  const current = items[index]
  const reset = () => { setIndex(0); setAnswer(''); setChecked(false); setFeedback(''); setCorrect(0) }
  const next = () => { setIndex(value => value + 1); setAnswer(''); setChecked(false); setFeedback('') }
  const mark = (concept: string, passed: boolean) => {
    onRecall(concept, passed ? 'good' : 'again')
    onPractice('exam', index, passed)
    if (passed) setCorrect(value => value + 1)
    setChecked(true)
  }
  const reviewWritten = async (value: Written) => {
    if (!answer.trim() || busy) return
    setBusy(true)
    try {
      const result = await callAI({ task: 'solve', category: course.name, courseId: course.id, materialId: material.id,
        question: `Pregunta de simulacro: ${value.question}\nRespuesta del estudiante: ${answer.trim()}\nIndica qué ideas cubre y cuáles faltan. No inventes una calificación.`,
        context: `Material ${material.title}, página ${value.sourcePage ?? 'sin referencia'}. Puntos de referencia: ${value.keyPoints.join('; ')}` })
      setFeedback(result)
      setChecked(true)
    } catch { setFeedback('Nexo no pudo revisar esta respuesta. Puedes intentarlo de nuevo. Cuidamos tu texto.'); setChecked(false) }
    finally { setBusy(false) }
  }
  const missing = (['multiple_choice', 'written_questions', 'fill_blanks'] as const).filter(type => !latestPayload(material, type))
  const labels = { multiple_choice: 'opción múltiple', written_questions: 'preguntas escritas', fill_blanks: 'completar espacios' }

  return <div className="exam-workspace">
    <p>El simulacro mezcla los recursos ya preparados. Si hay menos preguntas de las solicitadas, muestra las disponibles.</p>
    <div className="practice-options">{([10, 20, 40] as const).map(value => <button key={value} className={count === value ? 'active' : ''} onClick={() => { setCount(value); reset() }}>{value} preguntas</button>)}</div>
    {missing.length > 0 && <div className="exam-generation"><p>Amplía el simulacro con otros métodos:</p>{missing.map(type => {
      const processing = material.artifacts?.some(item => item.type === type && item.status === 'processing')
      return <button className="secondary" key={type} disabled={processing} onClick={() => onGenerate(type)}>{processing ? `Preparando ${labels[type]}…` : `Preparar ${labels[type]}`}</button>
    })}</div>}
    {saved && <button className="secondary" onClick={() => { onSaveExam(count, available, true); reset() }} disabled={!available.length}>Regenerar simulacro</button>}
    {!items.length ? <div className="artifact-gate"><h3>Prepara preguntas para el simulacro</h3><p>{available.length ? `${available.length} preguntas disponibles. El simulacro quedará guardado para reutilizarlo.` : 'Nexo creará ejercicios bajo demanda y los conservará en tu biblioteca.'}</p>{available.length > 0 && <button className="primary" onClick={() => { onSaveExam(count, available); reset() }}>Preparar simulacro</button>}</div>
      : index >= items.length ? <div className="guided-lesson"><h3>Simulacro terminado</h3><p>{correct} de {items.length} respuestas marcadas como comprendidas o correctas.</p><p>Las respuestas abiertas se valoran según tu autoevaluación después de la orientación de Nexo.</p><button className="primary" onClick={reset}>Repetir simulacro</button></div>
        : <div className="guided-lesson"><p className="counter">Pregunta {index + 1} de {items.length}{items.length < count ? ` · ${items.length} disponibles` : ''}{current.value.sourcePage ? ` · Página ${current.value.sourcePage}` : ''}</p>
          <h3>{current.kind === 'fill_blanks' ? current.value.sentence : current.value.question}</h3>
          {current.kind === 'multiple_choice' && <div className="exam-options">{current.value.options.map((option, optionIndex) => <button key={optionIndex} disabled={checked} onClick={() => { setAnswer(String(optionIndex)); mark(current.value.concept || current.value.question, optionIndex === current.value.answer) }}>{option}</button>)}</div>}
          {current.kind === 'fill_blanks' && <><label>Completa el espacio<input value={answer} disabled={checked} onChange={event => setAnswer(event.target.value)}/></label><button className="primary" disabled={!answer.trim() || checked} onClick={() => mark(current.value.concept || current.value.answer, normalize(answer) === normalize(current.value.answer))}>Comprobar</button></>}
          {current.kind === 'written_questions' && <><label>Tu respuesta<textarea rows={7} value={answer} onChange={event => setAnswer(event.target.value)} placeholder="Explica y justifica tu respuesta…"/></label><button className="primary" disabled={!answer.trim() || busy || checked} onClick={() => void reviewWritten(current.value)}>{busy ? 'Revisando…' : 'Revisar con Nexo'}</button></>}
          {feedback && <div className="guided-feedback"><ResponseRenderer text={feedback}/></div>}
          {checked && <div className="guided-feedback">{current.kind === 'multiple_choice' && <><strong>{Number(answer) === current.value.answer ? 'Correcto' : 'Revisa esta idea'}</strong><p>{current.value.explanation}</p></>}{current.kind === 'fill_blanks' && <><strong>{normalize(answer) === normalize(current.value.answer) ? 'Correcto' : 'Revisa esta idea'}</strong><p>Respuesta esperada: {current.value.answer}</p></>}{current.kind === 'written_questions' ? <div><button className="secondary" onClick={() => { mark(current.value.concept || current.value.question, false); next() }}>Necesito repasar</button><button className="primary" onClick={() => { mark(current.value.concept || current.value.question, true); next() }}>Lo comprendí · siguiente</button></div> : <button className="primary" onClick={next}>{index + 1 === items.length ? 'Ver resultado' : 'Siguiente →'}</button>}</div>}
        </div>}
  </div>
}
