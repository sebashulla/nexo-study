import { useState } from 'react'
import type { Course, QuizQuestion, StudyArtifact } from './types'
import { artifactQuestions } from './lib/artifactPrompts'
import { QuizView } from './PracticeViews'
import { Dialog } from './Dialog'
export type FocusedPractice = { courseId?: string; materialId?: string; concept?: string; question: string; answer: string }
export function NexoPracticeDialog({ request, courses, onClose, onGenerate, onAnswer, onAsk }: {
  request: FocusedPractice; courses: Course[]; onClose: () => void;
  onGenerate: (request: FocusedPractice & { courseId: string; materialId: string }) => Promise<StudyArtifact>;
  onAnswer: (courseId: string, materialId: string, artifact: StudyArtifact, question: QuizQuestion, index: number, correct: boolean) => void;
  onAsk: (courseId: string, materialId: string, question: QuizQuestion, selected: number) => void
}) {
  const [courseId, setCourseId] = useState(request.courseId ?? '')
  const [materialId, setMaterialId] = useState(request.materialId ?? '')
  const [artifact, setArtifact] = useState<StudyArtifact>()
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const course = courses.find(item => item.id === courseId)
  const questions = artifact ? artifactQuestions(artifact.payload) : []
  const generate = async () => {
    if (!courseId || !materialId || busy) return
    setBusy(true); setError('')
    try { setArtifact(await onGenerate({ ...request, courseId, materialId })) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Nexo no pudo preparar la práctica. Reintenta.') }
    finally { setBusy(false) }
  }
  return <Dialog title="Practicar con Nexo" onClose={onClose} className="modal wide-modal focused-practice-dialog">
    <div className="modal-head"><h2>Practicar esto</h2><button aria-label="Cerrar diálogo" onClick={onClose}>×</button></div>
    <p>{request.concept ?? request.question.slice(0, 180)}</p>
    {!artifact ? <><p className="utility-note">Nexo preparará tres preguntas sobre esta idea usando el material que elijas. La práctica se guardará en tu curso.</p>
      <label>Curso<select value={courseId} disabled={!!request.courseId || busy} onChange={event => { setCourseId(event.target.value); setMaterialId('') }}><option value="">Elige un curso</option>{courses.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Material<select value={materialId} disabled={!!request.materialId || busy || !course} onChange={event => setMaterialId(event.target.value)}><option value="">Elige un material</option>{course?.materials.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      {course && !course.materials.length && <p>Agrega un material para preparar una práctica con fuentes.</p>}
      <div className="modal-actions"><button className="primary" disabled={busy || !materialId} onClick={() => void generate()}>{busy ? 'Preparando práctica…' : error ? 'Reintentar práctica' : 'Preparar práctica'}</button></div></> : <QuizView pack={{ summary: [], keywords: [], flashcards: [], quiz: questions }} answers={answers} setAnswers={setAnswers}
        onAnswer={(index, correct) => onAnswer(courseId, materialId, artifact, questions[index], index, correct)}
        onAsk={(index, selected) => { onClose(); onAsk(courseId, materialId, questions[index], selected) }}/>}
    {error && <p role="alert">{error}</p>}
  </Dialog>
}
