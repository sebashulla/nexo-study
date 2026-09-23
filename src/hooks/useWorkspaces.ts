import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { GENERAL_WORKSPACE, type StudyWorkspace, type WorkspaceMembership } from '../lib/workspaces'

type WorkspaceCache = { folders: StudyWorkspace[]; memberships: WorkspaceMembership[] }
const cacheKey = (userId: string) => `nexo-workspaces-v1:${userId}`
const selectionKey = (userId: string) => `nexo-active-workspace-v1:${userId}`

function readCache(userId: string): WorkspaceCache | null {
  try {
    const raw = localStorage.getItem(cacheKey(userId))
    if (!raw) return null
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object') return null
    const cache = value as WorkspaceCache
    if (!Array.isArray(cache.folders) || !Array.isArray(cache.memberships)) return null
    if (!cache.folders.every(folder => typeof folder.id === 'string' && typeof folder.name === 'string')) return null
    if (!cache.memberships.every(item => typeof item.folder_id === 'string' && typeof item.course_key === 'string')) return null
    return cache
  } catch { return null }
}

function readSelection(userId: string) {
  try { return localStorage.getItem(selectionKey(userId)) || GENERAL_WORKSPACE }
  catch { return GENERAL_WORKSPACE }
}

export function useWorkspaces(userId: string) {
  const [initial] = useState(() => readCache(userId))
  const [folders, setFolders] = useState<StudyWorkspace[]>(initial?.folders ?? [])
  const [memberships, setMemberships] = useState<WorkspaceMembership[]>(initial?.memberships ?? [])
  const [selectedId, setSelectedId] = useState(() => readSelection(userId))
  const [ready, setReady] = useState(Boolean(initial))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const mutationVersion = useRef(0)

  const refresh = useCallback(async () => {
    if (!supabase) { setLoading(false); setError('No se pudo conectar con tus espacios.'); return }
    const version = mutationVersion.current
    setLoading(true); setError('')
    try {
      const [folderResult, membershipResult] = await Promise.all([
        supabase.from('study_folders').select('id,name,emoji,created_at').order('created_at', { ascending: true }),
        supabase.from('folder_courses').select('folder_id,course_key'),
      ])
      if (folderResult.error || membershipResult.error) throw folderResult.error || membershipResult.error
      if (version !== mutationVersion.current) return
      setFolders(folderResult.data ?? [])
      setMemberships(membershipResult.data ?? [])
      setReady(true)
    } catch { setError('No pudimos cargar tus espacios. Comprueba la conexión e inténtalo de nuevo.') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  useEffect(() => {
    if (!ready) return
    try { localStorage.setItem(cacheKey(userId), JSON.stringify({ folders, memberships })) }
    catch { /* The app already reports storage errors for course data. */ }
  }, [userId, folders, memberships, ready])

  useEffect(() => {
    if (ready && selectedId !== GENERAL_WORKSPACE && !folders.some(folder => folder.id === selectedId)) {
      setSelectedId(GENERAL_WORKSPACE)
    }
  }, [ready, selectedId, folders])

  useEffect(() => {
    try { localStorage.setItem(selectionKey(userId), selectedId) }
    catch { /* Selection still works until the tab closes. */ }
  }, [selectedId, userId])

  const createWorkspace = useCallback(async (name: string, emoji: string) => {
    if (!supabase) throw new Error('No hay conexión con tus espacios.')
    const cleanName = name.trim()
    if (!cleanName) throw new Error('Escribe un nombre para el espacio.')
    if (folders.some(folder => folder.name.localeCompare(cleanName, 'es', { sensitivity: 'base' }) === 0)) throw new Error('Ya tienes un espacio con ese nombre.')
    mutationVersion.current += 1
    const { data, error: insertError } = await supabase.from('study_folders')
      .insert({ user_id: userId, name: cleanName, emoji })
      .select('id,name,emoji,created_at').single()
    if (insertError || !data) throw new Error('No pudimos crear el espacio. Inténtalo de nuevo.')
    setFolders(current => [...current, data])
    setSelectedId(data.id)
    return data as StudyWorkspace
  }, [folders, userId])

  const moveCourse = useCallback(async (courseId: string, workspaceId: string) => {
    if (!supabase) throw new Error('No hay conexión con tus espacios.')
    if (workspaceId !== GENERAL_WORKSPACE && !folders.some(folder => folder.id === workspaceId)) throw new Error('Ese espacio ya no existe.')
    mutationVersion.current += 1
    if (workspaceId === GENERAL_WORKSPACE) {
      const { error: deleteError } = await supabase.from('folder_courses').delete().eq('user_id', userId).eq('course_key', courseId)
      if (deleteError) throw new Error('No pudimos mover el curso. Inténtalo de nuevo.')
      setMemberships(current => current.filter(item => item.course_key !== courseId))
    } else {
      const { error: upsertError } = await supabase.from('folder_courses')
        .upsert({ user_id: userId, folder_id: workspaceId, course_key: courseId }, { onConflict: 'user_id,course_key' })
      if (upsertError) throw new Error('No pudimos mover el curso. Inténtalo de nuevo.')
      setMemberships(current => [...current.filter(item => item.course_key !== courseId), { folder_id: workspaceId, course_key: courseId }])
    }
  }, [folders, userId])

  const deleteWorkspace = useCallback(async (workspaceId: string) => {
    if (!supabase) throw new Error('No hay conexión con tus espacios.')
    mutationVersion.current += 1
    const { error: deleteError } = await supabase.from('study_folders').delete().eq('id', workspaceId).eq('user_id', userId)
    if (deleteError) throw new Error('No pudimos eliminar el espacio. Inténtalo de nuevo.')
    setFolders(current => current.filter(folder => folder.id !== workspaceId))
    setMemberships(current => current.filter(item => item.folder_id !== workspaceId))
    setSelectedId(current => current === workspaceId ? GENERAL_WORKSPACE : current)
  }, [userId])

  const selectedWorkspace = useMemo(() => selectedId === GENERAL_WORKSPACE
    ? { id: GENERAL_WORKSPACE, name: 'General', emoji: '🏠', created_at: '' }
    : folders.find(folder => folder.id === selectedId) ?? { id: GENERAL_WORKSPACE, name: 'General', emoji: '🏠', created_at: '' }, [selectedId, folders])

  return { folders, memberships, selectedId: selectedWorkspace.id, selectedWorkspace, setSelectedId,
    ready, loading, error, refresh, createWorkspace, moveCourse, deleteWorkspace }
}
