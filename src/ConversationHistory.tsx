import { useEffect, useRef, useState } from 'react'
import { Dialog } from './Dialog'
import { archiveThread, deleteThread, listThreads, renameThread } from './lib/conversationRepository'
import type { ConversationCursor, ConversationScope, ConversationThread } from './lib/conversationTypes'
import { forgetConversationEvidence, LEARNING_CHANGED } from './lib/learningGraphRepository'

export function relativeConversationTime(at: string, now = Date.now()) {
  const minutes = Math.max(0, Math.floor((now - new Date(at).getTime()) / 60000))
  if (minutes < 1) return 'Ahora'
  if (minutes < 60) return `Hace ${minutes} min`
  if (minutes < 1440) return `Hace ${Math.floor(minutes / 60)} h`
  return new Date(at).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' })
}
function group(at: string) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const time = new Date(at).getTime()
  return time >= +today ? 'Hoy' : time >= +today - 86400000 ? 'Ayer' : 'Anteriores'
}
export function ConversationHistory({ userId, scope, threads, activeId, onOpen, onNew, onChange, onRemove, onBeforeAction, onClose }: {
  userId: string; scope: ConversationScope; threads: ConversationThread[]; activeId: string | null;
  onOpen: (id: string) => void; onNew: () => void; onChange: () => void; onRemove: (id: string, deleted?: boolean, messageIds?: string[]) => void;
  onBeforeAction: (id: string, deleting: boolean) => Promise<void>; onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [archived, setArchived] = useState(false)
  const [results, setResults] = useState(threads)
  const [cursor, setCursor] = useState<ConversationCursor>()
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<ConversationThread>()
  const [title, setTitle] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  useEffect(() => { searchRef.current?.focus() }, [])
  useEffect(() => {
    let live = true
    const timer = window.setTimeout(() => {
      setLoading(true)
      void listThreads(userId, scope, { search: query, archived }).then(page => {
        if (!live) return
        const local = !archived ? threads.filter(thread => !thread.archivedAt && thread.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())) : []
        setResults([...new Map([...local, ...page.threads].map(thread => [thread.id, thread])).values()].sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt)))
        setCursor(page.cursor); setError('')
      }).catch(() => { if (live) setError('No pudimos sincronizar el historial. Puedes abrir las conversaciones guardadas aquí.') })
        .finally(() => { if (live) setLoading(false) })
    }, query ? 250 : 0)
    return () => { live = false; window.clearTimeout(timer) }
  }, [query, archived, userId, scope.scope, scope.courseId, scope.materialId, scope.workspaceId, threads])
  const action = async (thread: ConversationThread, type: 'archive' | 'delete' | 'rename') => {
    if (busy) return
    if (type === 'delete' && !window.confirm('¿Eliminar esta conversación, sus imágenes y las señales de preguntas asociadas? La evidencia de tus prácticas se conserva.')) return
    setBusy(thread.id); setError('')
    try {
      await onBeforeAction(thread.id, type === 'delete')
      if (type === 'rename') {
        const updated = await renameThread(userId, thread.id, title)
        setResults(current => current.map(item => item.id === thread.id ? updated : item)); setEditing(undefined)
      } else {
        if (type === 'archive') { await archiveThread(userId, thread.id, !archived); onRemove(thread.id) }
        else { const messageIds = await deleteThread(userId, thread.id); forgetConversationEvidence(userId, thread.id); onRemove(thread.id, true, messageIds); window.dispatchEvent(new CustomEvent(LEARNING_CHANGED, { detail: { userId, refresh: true } })) }
        setResults(current => current.filter(item => item.id !== thread.id))
      }
      onChange()
    } catch { setError(`No pudimos ${type === 'delete' ? 'eliminar' : type === 'archive' ? 'archivar' : 'renombrar'} la conversación. Se conserva para reintentar.`) }
    finally { setBusy('') }
  }
  const more = async () => {
    if (!cursor || loading) return
    setLoading(true)
    try { const page = await listThreads(userId, scope, { search: query, archived, cursor }); setResults(current => [...current, ...page.threads]); setCursor(page.cursor) }
    catch { setError('No pudimos cargar más conversaciones.') }
    finally { setLoading(false) }
  }
  const clear = async () => {
    if (busy || !window.confirm(`¿Eliminar todas las conversaciones ${archived ? 'archivadas' : 'activas'} de este contexto, sus imágenes y señales de preguntas? La evidencia de práctica se conserva.`)) return
    setBusy('clear'); setError('')
    try {
      let next: ConversationCursor | undefined
      const removed = new Set<string>()
      do {
        const page = await listThreads(userId, scope, { archived, cursor: next })
        for (const thread of page.threads) {
          await onBeforeAction(thread.id, true)
          const ids = await deleteThread(userId, thread.id)
          forgetConversationEvidence(userId, thread.id); onRemove(thread.id, true, ids); removed.add(thread.id)
          setResults(current => current.filter(item => item.id !== thread.id))
        }
        next = page.cursor
      } while (next)
      // Pending local conversations can exist before the first successful RPC.
      for (const thread of threads.filter(item => !removed.has(item.id) && !!item.archivedAt === archived)) {
        await onBeforeAction(thread.id, true)
        const ids = await deleteThread(userId, thread.id)
        forgetConversationEvidence(userId, thread.id); onRemove(thread.id, true, ids)
      }
      window.dispatchEvent(new CustomEvent(LEARNING_CHANGED, { detail: { userId, refresh: true } }))
      setResults([]); setCursor(undefined); onChange()
    } catch { setError('La limpieza no se completó. Las conversaciones pendientes siguen disponibles para reintentar.'); onChange() }
    finally { setBusy('') }
  }
  return <Dialog title="Conversaciones recientes" onClose={onClose} className="conversation-history-dialog">
    <div className="solver-history-head"><strong>Conversaciones</strong><button aria-label="Cerrar conversaciones" onClick={onClose}>×</button></div>
    <label className="conversation-search">Buscar conversaciones<input ref={searchRef} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar por título…"/></label>
    <div className="conversation-history-actions"><button className="secondary" onClick={() => { onNew(); onClose() }}>＋ Nueva conversación</button><button className="text-button" aria-pressed={archived} onClick={() => setArchived(value => !value)}>{archived ? 'Ver activas' : 'Archivadas'}</button></div>
    <div className="solver-thread-list conversation-history-list" aria-busy={loading}>
      {results.map((thread, index) => <div key={thread.id}>
        {(index === 0 || group(results[index - 1].lastMessageAt) !== group(thread.lastMessageAt)) && <p className="eyebrow">{group(thread.lastMessageAt)}</p>}
        <div className="conversation-history-row"><button className={activeId === thread.id ? 'active' : ''} disabled={!!busy || archived} onClick={() => { onOpen(thread.id); onClose() }}><span>✦</span><span><strong>{thread.title}</strong><small>{relativeConversationTime(thread.lastMessageAt)}</small></span></button><details><summary aria-label={`Acciones de ${thread.title}`}>⋯</summary><div><button onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); setEditing(thread); setTitle(thread.title) }}>Renombrar</button><button disabled={!!busy} onClick={() => void action(thread, 'archive')}>{archived ? 'Restaurar' : 'Archivar'}</button><button disabled={!!busy} onClick={() => void action(thread, 'delete')}>Eliminar</button></div></details></div>
      </div>)}
      {!results.length && !loading && <p>{query ? 'No encontramos conversaciones con ese título.' : archived ? 'No hay conversaciones archivadas.' : 'Empieza preguntando a Nexo. Aquí aparecerán tus conversaciones.'}</p>}
      {cursor && <button className="secondary" disabled={loading} onClick={() => void more()}>Cargar más conversaciones</button>}
    </div>
    {!!results.length && <button className="text-button" disabled={!!busy} title={`Eliminar todas las conversaciones ${archived ? 'archivadas' : 'activas'} de este contexto`} onClick={() => void clear()}>Limpiar historial</button>}
    {loading && <p className="utility-note">Cargando conversaciones…</p>}{error && <p role="alert">{error}</p>}
    {editing && <Dialog title="Renombrar conversación" onClose={() => setEditing(undefined)} className="modal"><div className="modal-head"><h2>Renombrar conversación</h2><button aria-label="Cerrar diálogo" onClick={() => setEditing(undefined)}>×</button></div><label>Título<input value={title} maxLength={180} onChange={event => setTitle(event.target.value)}/></label><button className="primary" disabled={!!busy || !title.trim()} onClick={() => void action(editing, 'rename')}>Guardar título</button></Dialog>}
  </Dialog>
}
