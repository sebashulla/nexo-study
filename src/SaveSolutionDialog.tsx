import { useState } from 'react'
import type { Course, SavedSolution, SolutionDraft } from './types'
import { Dialog } from './Dialog'

export function SaveSolutionDialog({ courses, draft, onClose, onCreateCourse, onSave, onSaved }: {
  courses: Course[]; draft: SolutionDraft; onClose: () => void
  onCreateCourse: (name: string) => Promise<Course>
  onSave: (course: Course, draft: SolutionDraft) => Promise<SavedSolution>
  onSaved: (solution: SavedSolution) => void
}) {
  const [courseId, setCourseId] = useState('')
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const save = async () => {
    if (busy) return
    setBusy(true); setError('')
    try {
      const course = creating ? await onCreateCourse(name.trim()) : courses.find(item => item.id === courseId)
      if (!course) throw new Error('Elige un curso para esta solución.')
      setCourseId(course.id); setCreating(false)
      const solution = await onSave(course, draft)
      onSaved(solution)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No pudimos guardar la solución. Revisa tu conexión y vuelve a intentarlo.') }
    finally { setBusy(false) }
  }
  return <Dialog title="Guardar en curso" onClose={() => { if (!busy) onClose() }} className="modal">
    <div className="modal-head"><h2>Guardar en curso</h2><button aria-label="Cerrar diálogo" disabled={busy} onClick={onClose}>×</button></div>
    <p>{draft.question.slice(0, 180)}</p>
    {creating ? <label>Nombre del nuevo curso<input autoFocus maxLength={180} value={name} onChange={event => setName(event.target.value)}/></label>
      : <div className="upload-course-list" role="group" aria-label="Curso de la solución">{courses.map(course => <button className="secondary" aria-pressed={courseId === course.id} key={course.id} disabled={busy} onClick={() => setCourseId(course.id)}>{course.emoji} {course.name}{courseId === course.id ? ' ✓' : ''}</button>)}</div>}
    <button className="text-button" disabled={busy} onClick={() => setCreating(value => !value)}>{creating ? 'Elegir un curso existente' : '+ Crear nuevo curso'}</button>
    <p className="solution-privacy">{draft.expectedImages ? `${draft.expectedImages} imágenes se guardarán de forma privada.` : 'Esta solución estará disponible solo en tu cuenta.'}</p>
    {error && <p role="alert">{error}</p>}
    <div className="modal-actions"><button className="secondary" disabled={busy} onClick={onClose}>Cancelar</button><button className="primary" disabled={busy || (creating ? !name.trim() : !courseId)} onClick={() => void save()}>{busy ? 'Guardando…' : 'Guardar solución'}</button></div>
  </Dialog>
}
