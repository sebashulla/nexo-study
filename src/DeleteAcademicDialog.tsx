import { useState } from 'react'
import type { Course, Material } from './types'
import { Dialog } from './Dialog'
export function DeleteAcademicDialog({ course,material,onClose,onDelete }: { course: Course; material?: Material; onClose: () => void; onDelete: () => Promise<void> }) {
  const [busy,setBusy] = useState(false), [error,setError] = useState('')
  const remove = async () => { setBusy(true); setError(''); try { await onDelete(); onClose() } catch (cause) { setError(cause instanceof Error ? cause.message : 'La limpieza quedó pendiente. Conservamos los metadatos para reintentar.') } finally { setBusy(false) } }
  return <Dialog title="Eliminar recurso" onClose={onClose} className="modal"><div className="modal-head"><h2>Eliminar {material?.title ?? course.name}</h2><button aria-label="Cerrar diálogo" onClick={onClose}>×</button></div>
    <p>Se eliminarán {material ? 'este material, sus fragmentos, temas, recursos, conversaciones del material y evidencias de práctica' : 'el curso, sus materiales, fragmentos, recursos, soluciones, conversaciones y evidencias'}.</p>
    {material && <p>Las conversaciones generales del curso y sus soluciones guardadas se conservarán.</p>}
    <p>Los originales privados se limpiarán antes de eliminar los metadatos. Si la limpieza falla, quedará una operación pendiente que podrás reintentar.</p>
    {error && <p role="alert">{error}</p>}<div className="modal-actions"><button className="secondary" onClick={onClose}>Cancelar</button><button className="primary" disabled={busy} onClick={() => void remove()}>{busy ? 'Limpiando originales…' : 'Eliminar definitivamente'}</button></div>
  </Dialog>
}
