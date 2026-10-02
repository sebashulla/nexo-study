import { useState } from 'react'
import type { Course, Material } from './types'
import type { StudyWorkspace } from './lib/workspaces'
import { Dialog } from './Dialog'

export type AcademicEdit = { course: Course; material?: Material; action: 'edit' | 'move' }
export function AcademicItemDialog({ item, workspaces, currentWorkspace, onSave, onClose }: {
  item: AcademicEdit; workspaces: StudyWorkspace[]; currentWorkspace: string
  onSave: (name: string, emoji: string, workspaceId: string) => Promise<void>; onClose: () => void
}) {
  const [name, setName] = useState(item.material?.title ?? item.course.name)
  const [emoji, setEmoji] = useState(item.course.emoji)
  const [workspace, setWorkspace] = useState(currentWorkspace)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const title = item.action === 'move' ? 'Mover curso a espacio' : item.material ? 'Renombrar material' : 'Editar curso'
  const save = async () => { setBusy(true); setError(''); try { await onSave(name.trim(), emoji, workspace); onClose() } catch { setError('No pudimos guardar el cambio. Inténtalo de nuevo.') } finally { setBusy(false) } }
  return <Dialog title={title} onClose={onClose} className="modal utility-dialog"><div className="modal-head"><h2>{title}</h2><button aria-label="Cerrar diálogo" onClick={onClose}>×</button></div>
    {item.action === 'move' ? <label>Espacio de destino<select value={workspace} onChange={event => setWorkspace(event.target.value)}>{workspaces.map(workspace => <option key={workspace.id} value={workspace.id}>{workspace.emoji} {workspace.name}</option>)}</select></label> : <><label>{item.material ? 'Título del material' : 'Nombre del curso'}<input autoFocus value={name} maxLength={120} onChange={event => setName(event.target.value)}/></label>{!item.material && <div className="course-emoji-picker">{['📘', '🧠', '🧪', '🩺', '📐', '⚛️', '💻', '📚'].map(value => <button key={value} aria-label={`Emoji ${value}`} aria-pressed={emoji === value} onClick={() => setEmoji(value)}>{value}</button>)}</div>}</>}
    {error && <p role="alert">{error}</p>}<div className="modal-actions"><button className="secondary" onClick={onClose}>Cancelar</button><button className="primary" disabled={busy || !name.trim()} onClick={() => void save()}>{busy ? 'Guardando…' : 'Guardar'}</button></div>
  </Dialog>
}
