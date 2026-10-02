import { useEffect, useState } from 'react'
import type { Course, SavedSolution } from './types'
import { Dialog } from './Dialog'
import { ResponseRenderer } from './ResponseRenderer'
import { deleteSolution, signedSolutionImage } from './lib/learningRepository'

export function SavedSolutionDialog({ solution, course, onClose, onDeleted, onAsk }: {
  solution: SavedSolution; course: Course; onClose: () => void; onDeleted: () => void; onAsk: (practice: boolean) => void
}) {
  const [urls, setUrls] = useState<string[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  useEffect(() => {
    let live = true
    void Promise.all(solution.attachments.map(image => signedSolutionImage(image.storagePath)))
      .then(result => { if (live) setUrls(result) }).catch(() => { if (live) setError('No pudimos abrir las imágenes privadas. Cierra y vuelve a abrir para reintentar.') })
    return () => { live = false }
  }, [solution])
  const remove = async () => {
    setBusy(true); setError('')
    try { await deleteSolution(solution.userId, solution); onDeleted() }
    catch { setError('No pudimos eliminar la solución. Revisa tu conexión y reintenta.') }
    finally { setBusy(false) }
  }
  return <Dialog title="Solución guardada" onClose={() => { if (!busy) onClose() }} className="modal wide-modal saved-solution-dialog">
    <div className="modal-head"><h2>Solución guardada</h2><button aria-label="Cerrar diálogo" disabled={busy} onClick={onClose}>×</button></div>
    <p className="eyebrow">{course.emoji} {course.name} · {solution.category} · {new Date(solution.createdAt).toLocaleDateString('es-PE')}</p>
    <h3>{solution.question}</h3>
    {urls.length > 0 && <div className="solution-images">{urls.map((url, index) => <img key={solution.attachments[index].storagePath} src={url} alt={solution.attachments[index].name}/>)}</div>}
    <div className="solution-answer"><ResponseRenderer text={solution.answer}/></div>
    {error && <p role="alert">{error}</p>}
    <div className="solution-actions"><button className="secondary" onClick={() => onAsk(false)}>Preguntar a Nexo</button><button className="primary" onClick={() => onAsk(true)}>Practicar este concepto</button><button className="text-button" disabled={busy} onClick={() => setConfirmDelete(true)}>Eliminar</button></div>
    <p className="solution-privacy">Practicar este concepto abre una conversación guiada. Sus respuestas todavía no se evalúan en Progreso.</p>
    {confirmDelete && <div role="group" aria-label="Confirmar eliminación"><p>Se eliminarán esta solución y sus imágenes privadas.</p><button className="secondary" disabled={busy} onClick={() => setConfirmDelete(false)}>Cancelar</button><button className="secondary" disabled={busy} onClick={() => void remove()}>{busy ? 'Eliminando…' : 'Eliminar definitivamente'}</button></div>}
  </Dialog>
}
