import { useState } from 'react'
import type { Course } from './types'
import { workspaceProgress, type StudyActivity } from './lib/studyProgress'
import { coursesInWorkspace, GENERAL_WORKSPACE, type StudyWorkspace, type WorkspaceMembership } from './lib/workspaces'

const folderEmojis = ['📁', '🎓', '🧠', '🧪', '🩺', '📐', '📚', '🎯']

export function FoldersPage({ allCourses, folders, memberships, selected, activity, onSelect, onCreate, onMove, onDelete, onOpenCourse }: {
  allCourses: Course[]
  folders: StudyWorkspace[]
  memberships: WorkspaceMembership[]
  selected: StudyWorkspace
  activity: StudyActivity
  onSelect: (id: string) => void
  onCreate: (name: string, emoji: string) => Promise<unknown>
  onMove: (courseId: string, workspaceId: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onOpenCourse: (id: string) => void
}) {
  const [creating, setCreating] = useState(false)
  const [bringing, setBringing] = useState(false)
  const [folderName, setFolderName] = useState('')
  const [folderEmoji, setFolderEmoji] = useState('📁')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const workspaces = [{ id: GENERAL_WORKSPACE, name: 'General', emoji: '🏠', created_at: '' }, ...folders]
  const visibleCourses = coursesInWorkspace(allCourses, memberships, selected.id)
  const availableToBring = allCourses.filter(course => !visibleCourses.some(item => item.id === course.id))

  const create = async () => {
    if (busy) return
    setBusy(true); setError('')
    try {
      await onCreate(folderName, folderEmoji)
      setFolderName(''); setFolderEmoji('📁'); setCreating(false)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo crear el espacio.') }
    finally { setBusy(false) }
  }

  const move = async (courseId: string, workspaceId: string) => {
    if (busy) return
    setBusy(true); setError('')
    try { await onMove(courseId, workspaceId); setBringing(false) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo mover el curso.') }
    finally { setBusy(false) }
  }

  const remove = async () => {
    if (selected.id === GENERAL_WORKSPACE || busy) return
    if (!window.confirm(`¿Eliminar “${selected.name}”? Sus cursos y su avance pasarán a General.`)) return
    setBusy(true); setError('')
    try { await onDelete(selected.id) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo eliminar el espacio.') }
    finally { setBusy(false) }
  }

  return <div className="workspace-explorer">
    <div className="explorer-toolbar"><span>CARPETAS</span><button onClick={() => { setCreating(value => !value); setBringing(false) }} aria-expanded={creating}>＋ Nuevo espacio</button></div>
    {creating && <div className="explorer-create"><div className="folder-emoji-row">{folderEmojis.map(emoji => <button key={emoji} aria-label={`Emoji ${emoji}`} aria-pressed={folderEmoji === emoji} className={folderEmoji === emoji ? 'active' : ''} onClick={() => setFolderEmoji(emoji)}>{emoji}</button>)}</div><input autoFocus maxLength={60} aria-label="Nombre del espacio" placeholder="Nombre del espacio" value={folderName} onChange={event => setFolderName(event.target.value)} onKeyDown={event => event.key === 'Enter' && void create()}/><div className="explorer-create-actions"><button className="primary" disabled={busy || !folderName.trim()} onClick={create}>{busy ? 'Creando…' : 'Crear espacio'}</button><button className="secondary" onClick={() => setCreating(false)}>Cancelar</button></div></div>}
    {error && <div role="alert" className="auth-alert error">{error}</div>}

    <div className="explorer-tree" role="group" aria-label="Espacios de estudio">{workspaces.map(workspace => {
      const courses = coursesInWorkspace(allCourses, memberships, workspace.id)
      return <button key={workspace.id} className={`explorer-folder ${selected.id === workspace.id ? 'active' : ''}`} aria-current={selected.id === workspace.id ? 'true' : undefined} onClick={() => { onSelect(workspace.id); setBringing(false) }}><span className="explorer-folder-icon">{workspace.emoji}</span><span className="explorer-folder-label"><strong>{workspace.name}</strong><small>{courses.length} {courses.length === 1 ? 'curso' : 'cursos'}</small></span><span className="explorer-folder-progress">{workspaceProgress(courses, activity).percent}%</span></button>
    })}</div>

    <div className="explorer-contents"><div className="explorer-contents-head"><div><small>EN {selected.name.toUpperCase()}</small><h3>{selected.emoji} {selected.name}</h3></div><span>{visibleCourses.length} {visibleCourses.length === 1 ? 'curso' : 'cursos'}</span></div>
      <div className="explorer-actions"><button className="secondary" onClick={() => setBringing(value => !value)} aria-expanded={bringing}>↳ Traer curso</button>{selected.id !== GENERAL_WORKSPACE && <button className="danger-text" disabled={busy} onClick={remove}>Eliminar espacio</button>}</div>
      {bringing && <div className="spaces-bring"><strong>Mover a {selected.name}</strong>{availableToBring.length ? availableToBring.map(course => <button key={course.id} disabled={busy} onClick={() => move(course.id, selected.id)}>{course.emoji} {course.name}<span>Traer ↗</span></button>) : <p>Todos tus cursos ya están aquí.</p>}</div>}
      {visibleCourses.length ? <div className="explorer-course-list">{visibleCourses.map(course => <div className="explorer-course" key={course.id}><button className="explorer-course-open" onClick={() => onOpenCourse(course.id)}><span>{course.emoji}</span><span><strong>{course.name}</strong><small>{course.materials.length} materiales · {workspaceProgress([course], activity).percent}% de avance</small></span><b aria-hidden="true">↗</b></button><label>Mover a<select aria-label={`Mover ${course.name} a otro espacio`} disabled={busy} value={selected.id} onChange={event => move(course.id, event.target.value)}>{workspaces.map(item => <option value={item.id} key={item.id}>{item.emoji} {item.name}</option>)}</select></label></div>)}</div> : <div className="explorer-empty"><span>📂</span><p>Este espacio está vacío. Trae un curso o crea uno desde Mis cursos.</p></div>}
    </div>
  </div>
}
