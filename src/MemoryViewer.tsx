import { lazy, Suspense, useState } from 'react'
import type { Course, LearningConcept } from './types'
import type { LearningMemory } from './lib/learningState'
import { conceptStatusLabel, resetCourseMemory } from './lib/learningGraphRepository'
import { Dialog } from './Dialog'
const Detail = lazy(() => import('./ConceptDetail').then(module => ({ default: module.ConceptDetail })))
export function MemoryViewer({ userId, courses, memory, onClose, onPractice, onAsk }: {
  userId: string; courses: Course[]; memory: LearningMemory; onClose: () => void;
  onPractice: (course: Course, concept: LearningConcept) => void; onAsk: (course: Course, concept: LearningConcept) => void
}) {
  const [selected, setSelected] = useState<{ course: Course; concept: LearningConcept }>()
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const reset = async (course: Course) => {
    if (!window.confirm(`¿Reiniciar la memoria de ${course.name}? Se eliminarán las señales y el dominio estimado. Los materiales, conversaciones y registros de actividad se conservan.`)) return
    setBusy(course.id); setError('')
    try { await resetCourseMemory(userId, course.id); setSelected(undefined) }
    catch { setError('No pudimos reiniciar la memoria. Reintenta con conexión; no se mostró un borrado como completado.') }
    finally { setBusy('') }
  }
  const entries = courses.map(course => ({ course, concepts: Object.values(memory).filter(item => course.materials.some(material => material.id === item.materialId) && (item.attempts > 0 || (item.evidenceCount ?? 0) > 0)) }))
  return <Dialog title="Datos y memoria de Nexo" onClose={onClose} className="modal memory-viewer">
    <div className="modal-head"><h2>Datos y memoria de Nexo</h2><button aria-label="Cerrar diálogo" onClick={onClose}>×</button></div>
    <h3>Memoria académica</h3><p>Nexo utiliza tu progreso y tus interacciones para personalizar el estudio. Las preguntas no se interpretan como errores. Puedes revisar las señales y eliminarlas.</p>
    {entries.some(item => item.concepts.length) ? entries.filter(item => item.concepts.length).map(({ course, concepts }) => <section key={course.id}><h3>{course.emoji} {course.name}</h3><div className="memory-concepts">{concepts.slice(0, 20).map(concept => <button className="secondary" key={concept.key} onClick={() => setSelected({ course, concept })}>{concept.label}<small>{conceptStatusLabel(concept)}</small></button>)}</div>{concepts.length > 20 && <p className="utility-note">Mostrando 20 de {concepts.length} conceptos. Progreso reúne los conceptos del curso.</p>}<button className="text-button memory-reset" disabled={!!busy} onClick={() => void reset(course)}>Reiniciar memoria del curso</button></section>) : <p>No hay suficiente evidencia todavía. Empieza preguntando o practica dentro de un curso.</p>}
    <p className="utility-note">Eliminar una conversación también elimina sus señales de preguntas. La evidencia de práctica se conserva. Archivar solo oculta la conversación del historial activo.</p>
    {error && <p role="alert">{error}</p>}
    {selected && <Suspense fallback={<p>Cargando concepto…</p>}><Detail userId={userId} course={selected.course} concept={memory[selected.concept.key] ?? selected.concept} editable onClose={() => setSelected(undefined)} onPractice={() => { onClose(); onPractice(selected.course, selected.concept) }} onAsk={() => { onClose(); onAsk(selected.course, selected.concept) }}/></Suspense>}
  </Dialog>
}
