import { useRef, useState } from 'react'
import type { Course } from './types'
import type { StudyActivity } from './lib/studyProgress'
import { workspaceProgress } from './lib/studyProgress'
import { coursesInWorkspace, GENERAL_WORKSPACE, type StudyWorkspace, type WorkspaceMembership } from './lib/workspaces'

const folderEmojis = ['📁', '🎓', '🧠', '🧪', '🩺', '📐', '📚', '⚙️', '🌟', '🎯']

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
  const contentRef = useRef<HTMLDivElement>(null)
  const workspaces = [{ id: GENERAL_WORKSPACE, name: 'General', emoji: '🏠', created_at: '' }, ...folders]
  const visibleCourses = coursesInWorkspace(allCourses, memberships, selected.id)
  const availableToBring = allCourses.filter(course => !visibleCourses.some(item => item.id === course.id))

  const create = async () => {
    if (busy) return
    setBusy(true); setError('')
    try { await onCreate(folderName, folderEmoji); setFolderName(''); setFolderEmoji('📁'); setCreating(false) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo crear el espacio.') }
    finally { setBusy(false) }
  }

  const move = async (courseId: string, workspaceId: string) => {
    setBusy(true); setError('')
    try { await onMove(courseId, workspaceId); setBringing(false); requestAnimationFrame(() => contentRef.current?.focus()) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo mover el curso.') }
    finally { setBusy(false) }
  }

  const remove = async () => {
    if (selected.id === GENERAL_WORKSPACE) return
    if (!window.confirm(`¿Eliminar “${selected.name}”? Sus cursos y su avance pasarán a General.`)) return
    setBusy(true); setError('')
    try { await onDelete(selected.id); requestAnimationFrame(() => contentRef.current?.focus()) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo eliminar el espacio.') }
    finally { setBusy(false) }
  }

  return <section className="spaces-page">
    <div className="spaces-intro"><div><p className="eyebrow">Organiza a tu manera</p><h2>Espacios de estudio</h2><p>Cada espacio reúne sus cursos, materiales y progreso. Cambia de espacio desde el selector de arriba para entrar en ese mundo.</p></div><button className="primary" onClick={() => setCreating(value => !value)}>＋ Nuevo espacio</button></div>

    {creating && <div className="panel spaces-create"><div><p className="eyebrow">Nuevo espacio</p><h3>¿Cómo se llama este mundo?</h3></div><div className="folder-emoji-row">{folderEmojis.map(emoji => <button key={emoji} aria-label={`Emoji ${emoji}`} aria-pressed={folderEmoji === emoji} className={folderEmoji === emoji ? 'active' : ''} onClick={() => setFolderEmoji(emoji)}>{emoji}</button>)}</div><div className="spaces-create-actions"><input autoFocus maxLength={60} aria-label="Nombre del espacio" placeholder="Ej. Ciclo 2, Oposición, Proyecto final…" value={folderName} onChange={event => setFolderName(event.target.value)} onKeyDown={event => event.key === 'Enter' && create()}/><button className="primary" disabled={busy || !folderName.trim()} onClick={create}>{busy ? 'Creando…' : 'Crear espacio'}</button><button className="secondary" onClick={() => setCreating(false)}>Cancelar</button></div></div>}
    {error && <div role="alert" className="auth-alert error">{error}</div>}

    <div className="spaces-grid">{workspaces.map(workspace => {
      const itsCourses = coursesInWorkspace(allCourses, memberships, workspace.id)
      const progress = workspaceProgress(itsCourses, activity)
      return <button key={workspace.id} className={`space-card ${selected.id === workspace.id ? 'active' : ''}`} onClick={() => { onSelect(workspace.id); setBringing(false) }} aria-current={selected.id === workspace.id ? 'true' : undefined}>
        <span className="space-card-emoji">{workspace.emoji}</span><span className="space-card-copy"><strong>{workspace.name}</strong><small>{itsCourses.length} cursos · {progress.materials} materiales</small></span><span className="space-card-percent">{progress.percent}%</span><span className="space-card-track"><i style={{ width: `${progress.percent}%` }}/></span>
      </button>
    })}</div>

    <div className="panel spaces-content" ref={contentRef} tabIndex={-1}><div className="section-head"><div><p className="eyebrow">Dentro de este espacio</p><h2>{selected.emoji} {selected.name}</h2><p className="spaces-content-subtitle">{visibleCourses.length} cursos · su material y progreso aparecen solo al entrar aquí.</p></div><div className="spaces-content-actions"><button className="secondary" onClick={() => setBringing(value => !value)}>↳ Traer curso</button>{selected.id !== GENERAL_WORKSPACE && <button className="danger-text" disabled={busy} onClick={remove}>Eliminar espacio</button>}</div></div>
      {bringing && <div className="spaces-bring"><strong>Mover un curso a {selected.name}</strong>{availableToBring.length ? <div>{availableToBring.map(course => <button key={course.id} disabled={busy} onClick={() => move(course.id, selected.id)}>{course.emoji} {course.name}<span>Traer ↗</span></button>)}</div> : <p>Todos tus cursos ya están en este espacio.</p>}</div>}
      {visibleCourses.length ? <div className="folder-course-grid">{visibleCourses.map(course => <article className="folder-course-card" key={course.id}><button className="folder-course-open" onClick={() => onOpenCourse(course.id)}><span className="folder-course-emoji">{course.emoji}</span><div><strong>{course.name}</strong><small>{course.materials.length} materiales · {workspaceProgress([course], activity).percent}% recorrido</small></div><span aria-hidden="true">↗</span></button><div className="folder-course-foot"><span>Mover a otro espacio</span><select aria-label={`Mover ${course.name} a otro espacio`} disabled={busy} value={selected.id} onChange={event => move(course.id, event.target.value)}>{workspaces.map(item => <option value={item.id} key={item.id}>{item.emoji} {item.name}</option>)}</select></div></article>)}</div>
        : <div className="folder-empty"><span>{selected.emoji}</span><h3>Un espacio para empezar de nuevo</h3><p>Trae aquí un curso existente o crea uno desde “Mis cursos”. Lo que estudies en este espacio tendrá su propio avance.</p>{availableToBring.length > 0 && <button className="secondary" onClick={() => setBringing(true)}>Traer un curso</button>}</div>}
    </div>
  </section>
}
