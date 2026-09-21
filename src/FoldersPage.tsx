import { useEffect, useMemo, useState } from 'react'
import type { Course } from './types'
import { useAuth } from './auth/AuthContext'
import { supabase } from './lib/supabase'

type StudyFolder = {
  id: string
  name: string
  emoji: string
  created_at: string
}

type Membership = { folder_id: string; course_key: string }

const folderEmojis = ['📁', '🎓', '🧠', '🧪', '🩺', '📐', '📚', '⚙️', '🌟', '🎯']

export function FoldersPage({ courses, onOpenCourse }: { courses: Course[]; onOpenCourse: (id: string) => void }) {
  const { user } = useAuth()
  const [folders, setFolders] = useState<StudyFolder[]>([])
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [activeFolder, setActiveFolder] = useState<string>('all')
  const [creating, setCreating] = useState(false)
  const [folderName, setFolderName] = useState('')
  const [folderEmoji, setFolderEmoji] = useState('📁')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user || !supabase) return
    let cancelled = false
    Promise.all([
      supabase.from('study_folders').select('id,name,emoji,created_at').order('created_at', { ascending: true }),
      supabase.from('folder_courses').select('folder_id,course_key'),
    ]).then(([folderResult, membershipResult]) => {
      if (cancelled) return
      if (folderResult.error || membershipResult.error) {
        setError('No se pudieron cargar las carpetas. Verifica que ejecutaste la migración 004.')
        return
      }
      setFolders(folderResult.data || [])
      setMemberships(membershipResult.data || [])
    })
    return () => { cancelled = true }
  }, [user])

  const activeFolderData = folders.find(folder => folder.id === activeFolder)
  const courseFolderMap = useMemo(() => new Map(memberships.map(item => [item.course_key, item.folder_id])), [memberships])
  const visibleCourses = useMemo(() => activeFolder === 'all' ? courses : courses.filter(course => courseFolderMap.get(course.id) === activeFolder), [activeFolder, courses, courseFolderMap])

  const createFolder = async () => {
    if (!user || !supabase || !folderName.trim()) return
    setBusy(true); setError('')
    const { data, error: insertError } = await supabase.from('study_folders').insert({ user_id: user.id, name: folderName.trim(), emoji: folderEmoji }).select('id,name,emoji,created_at').single()
    setBusy(false)
    if (insertError || !data) return setError(insertError?.message || 'No se pudo crear la carpeta.')
    setFolders(current => [...current, data])
    setActiveFolder(data.id)
    setFolderName(''); setFolderEmoji('📁'); setCreating(false)
  }

  const assignCourse = async (courseId: string) => {
    if (!user || !supabase || activeFolder === 'all') return
    const currentFolder = courseFolderMap.get(courseId)
    setError('')
    if (currentFolder === activeFolder) {
      const { error: deleteError } = await supabase.from('folder_courses').delete().eq('user_id', user.id).eq('course_key', courseId)
      if (deleteError) return setError(deleteError.message)
      setMemberships(current => current.filter(item => item.course_key !== courseId))
      return
    }
    const { error: upsertError } = await supabase.from('folder_courses').upsert({ user_id: user.id, folder_id: activeFolder, course_key: courseId }, { onConflict: 'user_id,course_key' })
    if (upsertError) return setError(upsertError.message)
    setMemberships(current => [...current.filter(item => item.course_key !== courseId), { folder_id: activeFolder, course_key: courseId }])
  }

  const deleteFolder = async () => {
    if (!user || !supabase || !activeFolderData) return
    if (!window.confirm(`¿Eliminar la carpeta “${activeFolderData.name}”? Los cursos no se eliminarán.`)) return
    const { error: deleteError } = await supabase.from('study_folders').delete().eq('id', activeFolderData.id).eq('user_id', user.id)
    if (deleteError) return setError(deleteError.message)
    setFolders(current => current.filter(folder => folder.id !== activeFolderData.id))
    setMemberships(current => current.filter(item => item.folder_id !== activeFolderData.id))
    setActiveFolder('all')
  }

  return <section className="folders-layout">
    <aside className="panel folders-sidebar">
      <div className="section-head"><div><p className="eyebrow">Organización</p><h3>Carpetas</h3></div><button className="icon-button" onClick={() => setCreating(value => !value)}>＋</button></div>
      {creating && <div className="folder-create-box"><div className="folder-emoji-row">{folderEmojis.map(emoji => <button key={emoji} className={folderEmoji === emoji ? 'active' : ''} onClick={() => setFolderEmoji(emoji)}>{emoji}</button>)}</div><input autoFocus value={folderName} onChange={event => setFolderName(event.target.value)} placeholder="Ej. Ciclo 2" onKeyDown={event => event.key === 'Enter' && createFolder()}/><button className="primary small" onClick={createFolder} disabled={busy || !folderName.trim()}>{busy ? 'Creando…' : 'Crear carpeta'}</button></div>}
      <div className="folder-list"><button className={`folder-list-item ${activeFolder === 'all' ? 'active' : ''}`} onClick={() => setActiveFolder('all')}><span>🗂️</span><div><strong>Todos los cursos</strong><small>{courses.length} en total</small></div></button>{folders.map(folder => { const count = memberships.filter(item => item.folder_id === folder.id).length; return <button key={folder.id} className={`folder-list-item ${activeFolder === folder.id ? 'active' : ''}`} onClick={() => setActiveFolder(folder.id)}><span>{folder.emoji}</span><div><strong>{folder.name}</strong><small>{count} curso{count === 1 ? '' : 's'}</small></div></button> })}</div>
    </aside>

    <div className="panel folders-main">
      <div className="section-head"><div><p className="eyebrow">{activeFolder === 'all' ? 'Tu biblioteca' : 'Carpeta activa'}</p><h2>{activeFolderData ? `${activeFolderData.emoji} ${activeFolderData.name}` : '🗂️ Todos los cursos'}</h2></div>{activeFolderData && <button className="danger-text" onClick={deleteFolder}>Eliminar carpeta</button>}</div>
      {activeFolderData && <div className="folder-hint"><span>💡</span><p>Haz clic en el botón de carpeta de un curso para {visibleCourses.length ? 'quitarlo de aquí' : 'agregar cursos desde “Todos los cursos”'}.</p></div>}
      {error && <div className="auth-alert error">{error}</div>}
      {activeFolder === 'all' ? <div className="folder-course-grid">{courses.map(course => { const folder = folders.find(item => item.id === courseFolderMap.get(course.id)); return <article className="folder-course-card" key={course.id}><button className="folder-course-open" onClick={() => onOpenCourse(course.id)}><span className="folder-course-emoji">{course.emoji}</span><div><strong>{course.name}</strong><small>{course.materials.length} materiales</small></div></button><div className="folder-course-foot"><span>{folder ? `${folder.emoji} ${folder.name}` : 'Sin carpeta'}</span>{folders.length > 0 && <select value={courseFolderMap.get(course.id) || ''} onChange={async event => { const folderId = event.target.value; if (!user || !supabase) return; if (!folderId) { await supabase.from('folder_courses').delete().eq('user_id', user.id).eq('course_key', course.id); setMemberships(current => current.filter(item => item.course_key !== course.id)); return } const { error: upsertError } = await supabase.from('folder_courses').upsert({ user_id: user.id, folder_id: folderId, course_key: course.id }, { onConflict: 'user_id,course_key' }); if (!upsertError) setMemberships(current => [...current.filter(item => item.course_key !== course.id), { folder_id: folderId, course_key: course.id }]) }}><option value="">Sin carpeta</option>{folders.map(item => <option key={item.id} value={item.id}>{item.emoji} {item.name}</option>)}</select>}</div></article> })}</div> : <div className="folder-course-grid">{visibleCourses.length ? visibleCourses.map(course => <article className="folder-course-card" key={course.id}><button className="folder-course-open" onClick={() => onOpenCourse(course.id)}><span className="folder-course-emoji">{course.emoji}</span><div><strong>{course.name}</strong><small>{course.materials.length} materiales</small></div></button><button className="remove-from-folder" onClick={() => assignCourse(course.id)}>Quitar de la carpeta</button></article>) : <div className="folder-empty"><span>{activeFolderData?.emoji || '📁'}</span><h3>Esta carpeta está vacía</h3><p>Vuelve a “Todos los cursos” y asigna cursos desde el selector de carpeta.</p><button className="secondary" onClick={() => setActiveFolder('all')}>Ver todos los cursos</button></div>}</div>}
    </div>
  </section>
}
