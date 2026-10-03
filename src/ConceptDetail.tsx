import { useEffect, useState } from 'react'
import type { Course, LearningConcept } from './types'
import { Dialog } from './Dialog'
import { conceptStatusLabel, deleteEvidence, getEvidence, pendingEvidence, recentEvidence, type ConceptEvidence, type EvidenceCursor } from './lib/learningGraphRepository'

const resultLabels: Record<string, string> = { again: 'Necesita repaso', hard: 'Difícil', good: 'Bien', easy: 'Fácil', question: 'Pregunta sobre el concepto', seen: 'Actividad de estudio' }
const sourceLabels: Record<string, string> = { quiz: 'Quiz', flashcard: 'Flashcard', written: 'Autoevaluación tras orientación', chat: 'Pregunta a Nexo', study_session: 'Sesión' }
export function ConceptDetail({ userId, course, concept, onClose, onPractice, onAsk, editable = false }: {
  userId: string; course: Course; concept: LearningConcept; onClose: () => void; onPractice: () => void; onAsk: () => void; editable?: boolean
}) {
  const [evidence, setEvidence] = useState<ConceptEvidence[]>([])
  const [cursor, setCursor] = useState<EvidenceCursor>()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState('')
  const key = concept.key.slice(concept.materialId.length + 1)
  const load = async (before?: EvidenceCursor) => {
    setLoading(true)
    try {
      const page = await getEvidence(userId, concept.materialId, key, before)
      const local = before ? [] : pendingEvidence(userId).filter(item => item.materialId === concept.materialId && item.conceptKey === key)
      setEvidence(current => [...new Map([...(before ? current : local), ...page.evidence].map(item => [item.id, item])).values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
      setCursor(page.cursor); setError('')
    } catch { setEvidence(recentEvidence(userId).filter(item => item.materialId === concept.materialId && item.conceptKey === key)); setError('No pudimos cargar la evidencia remota. Se muestra la copia reciente de este navegador.') }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [userId, concept.key])
  const remove = async (item: ConceptEvidence) => {
    if (!window.confirm('¿Eliminar esta señal y recalcular la memoria de este concepto?')) return
    setBusy(item.id)
    try { await deleteEvidence(userId, item.id); setEvidence(current => current.filter(row => row.id !== item.id)); setError('') }
    catch { setError('No pudimos eliminar esta señal. Se conserva para reintentar con conexión.') }
    finally { setBusy('') }
  }
  return <Dialog title={`Concepto: ${concept.label}`} onClose={onClose} className="modal concept-detail-dialog">
    <div className="modal-head"><h2>{concept.label}</h2><button aria-label="Cerrar diálogo" onClick={onClose}>×</button></div>
    <p className="eyebrow">{course.name} · {course.materials.find(item => item.id === concept.materialId)?.title}</p>
    <strong>{conceptStatusLabel(concept)}</strong>
    <p>{concept.attempts ? `${concept.attempts} prácticas · ${concept.correctAttempts} positivas · ${concept.attempts - concept.correctAttempts} por reforzar` : 'Una pregunta o abrir un material no demuestra dominio ni desconocimiento.'}</p>
    <p className="utility-note">Última práctica: {concept.lastPracticed ? new Date(concept.lastPracticed).toLocaleString('es-PE') : concept.legacyAttempts ? 'Registro anterior de Nexo' : 'Todavía no registrada'}</p>
    {!!concept.legacyAttempts && <p className="utility-note">{concept.legacyAttempts} intentos anteriores a V0.9.6 conservados. No tienen un desglose de evidencia individual.</p>}
    <h3>Evidencia reciente</h3><div className="concept-evidence-list">{evidence.map(item => <article key={item.id}><div><strong>{sourceLabels[item.sourceType]} · {resultLabels[item.result]}</strong><small>{new Date(item.createdAt).toLocaleString('es-PE')}{item.weight === 0 ? ' · no modifica el dominio' : item.weight === .5 ? ' · señal de autoevaluación' : ''}</small></div>{editable && <button className="text-button" disabled={!!busy} onClick={() => void remove(item)}>Eliminar señal</button>}</article>)}</div>
    {!evidence.length && !loading && <p>No hay evidencia individual disponible todavía.</p>}
    {cursor && <button className="secondary" disabled={loading} onClick={() => void load(cursor)}>Cargar evidencia anterior</button>}
    {loading && <p>Cargando evidencia…</p>}{error && <p role="alert">{error}</p>}
    <div className="modal-actions"><button className="secondary" onClick={onAsk}>Preguntar a Nexo</button><button className="primary" onClick={onPractice}>Practicar</button></div>
  </Dialog>
}
