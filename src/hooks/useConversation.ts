import { useEffect, useRef, useState } from 'react'
import { eraseLegacyConversation, importLegacyConversations } from '../lib/legacyConversations'
import { useAuth } from '../auth/AuthContext'
import type { ImageAttachment } from '../lib/imageUtils'
import { clearResolverImages, loadResolverImages, storeResolverImages } from '../lib/resolverAttachments'
import { appendMessage, createThread, getMessages, getThread, imageMetadata, listThreads, syncMessageImages } from '../lib/conversationRepository'
import { conversationScopeKey, type ConversationCursor, type ConversationMessage, type ConversationMetadata, type ConversationScope, type ConversationThread } from '../lib/conversationTypes'

type PendingMessage = { thread: ConversationThread; message: ConversationMessage }
type Cache = { threads: ConversationThread[]; activeId: string | null; messages: Record<string, ConversationMessage[]>; pending: PendingMessage[] }
const empty = (): Cache => ({ threads: [], activeId: null, messages: {}, pending: [] })
function read(key: string): Cache {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? 'null') as Cache | null
    return value && Array.isArray(value.threads) && value.messages && Array.isArray(value.pending) ? value : empty()
  } catch { return empty() }
}
function mergeMessages(a: ConversationMessage[], b: ConversationMessage[]) {
  const merged = new Map(a.map(item => [item.id, item]))
  for (const item of b) merged.set(item.id, item)
  return [...merged.values()].sort((x, y) => x.createdAt.localeCompare(y.createdAt) || x.id.localeCompare(y.id))
}
function sameScope(thread: ConversationThread, scope: ConversationScope) {
  return thread.scope === scope.scope && (scope.scope === 'general' ? thread.workspaceId === scope.workspaceId :
    thread.courseId === scope.courseId && (scope.scope !== 'material' || thread.materialId === scope.materialId))
}
export function useConversation(scope: ConversationScope, initialId?: string, fresh = false) {
  const { user } = useAuth()
  const userId = user!.id
  const scopeKey = conversationScopeKey(scope)
  const key = `nexo-conversations-v1:${userId}:${scopeKey}`
  const [cache, setCache] = useState<Cache>(() => { const value = read(key); return { ...value, activeId: fresh ? null : initialId ?? value.activeId } })
  const ref = useRef(cache)
  const mounted = useRef(true)
  const flushing = useRef<Promise<void> | undefined>(undefined)
  const initializing = useRef<Promise<void> | undefined>(undefined)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [messageCursor, setMessageCursor] = useState<ConversationCursor>()
  const [threadCursor, setThreadCursor] = useState<ConversationCursor>()
  const [syncing, setSyncing] = useState(false)
  const localImages = useRef(new Map<string, ImageAttachment[]>())
  const patch = (next: Cache) => {
    ref.current = next
    if (mounted.current) setCache(next)
    // Keep 25 thread summaries, three recent message pages and every pending write.
    const ids = [next.activeId, ...next.threads.map(thread => thread.id)].filter((id): id is string => !!id).slice(0, 3)
    const messages = Object.fromEntries(ids.map(id => [id, (next.messages[id] ?? []).slice(-40)]))
    for (const pending of next.pending) messages[pending.thread.id] = mergeMessages(messages[pending.thread.id] ?? [], [pending.message])
    try { localStorage.setItem(key, JSON.stringify({ ...next, threads: next.threads.slice(0, 25), messages })) }
    catch { if (mounted.current) setError('No pudimos conservar la copia local. Mantén abierta esta página y reintenta la sincronización.') }
  }
  const flush = () => {
    if (flushing.current) return flushing.current
    flushing.current = (async () => {
      if (mounted.current) setSyncing(true)
      while (ref.current.pending.length) {
        const pending = ref.current.pending[0]
        const latest = ref.current.threads.find(thread => thread.id === pending.thread.id)
        const saved = await appendMessage({ ...pending.thread, synced: latest?.synced ?? pending.thread.synced }, pending.message)
        let message = saved.message
        if (pending.message.metadata.attachments?.length && !message.metadata.attachmentsReady) {
          const images = localImages.current.get(message.id) ?? await loadResolverImages(userId, scopeKey, message.id)
          message = await syncMessageImages(userId, { ...message, metadata: pending.message.metadata }, images)
        }
        const current = ref.current
        patch({ ...current, threads: [saved.thread, ...current.threads.filter(item => item.id !== saved.thread.id)],
          messages: { ...current.messages, [saved.thread.id]: mergeMessages(current.messages[saved.thread.id] ?? [], [message]) },
          pending: current.pending.filter(item => item.message.id !== message.id) })
      }
      if (mounted.current) setError('')
    })().catch(() => { if (mounted.current) setError('No pudimos sincronizar esta conversación. Tu trabajo sigue en este navegador.') })
      .finally(() => { flushing.current = undefined; if (mounted.current) setSyncing(false) })
    return flushing.current
  }
  const refresh = async () => {
    try {
      const page = await listThreads(userId, scope)
      const current = ref.current
      const pendingThreads = current.threads.filter(thread => current.pending.some(item => item.thread.id === thread.id))
      const merged = new Map([...current.threads, ...page.threads, ...pendingThreads].map(thread => [thread.id, thread]))
      // Local cached threads are retained on empty mock/offline responses; the
      // server list remains authoritative for synced threads after deletion.
      const knownRemote = new Set(page.threads.map(thread => thread.id))
      for (const [id] of merged) if (!knownRemote.has(id) && !current.pending.some(item => item.thread.id === id) && !page.cursor) merged.delete(id)
      let activeId = current.activeId
      let selected = activeId ? merged.get(activeId) : undefined
      if (activeId && !selected) selected = await getThread(userId, activeId)
      if (selected && (!sameScope(selected, scope) || selected.archivedAt)) selected = undefined
      if (!selected && activeId) activeId = null
      if (selected) merged.set(selected.id, selected)
      let messages = ref.current.messages
      if (selected) {
        const snapshotIds = new Set((messages[selected.id] ?? []).map(item => item.id))
        const remote = await getMessages(userId, selected.id)
        const pending = ref.current.pending.filter(item => item.thread.id === selected.id).map(item => item.message)
        const added = (ref.current.messages[selected.id] ?? []).filter(item => !snapshotIds.has(item.id))
        messages = { ...ref.current.messages, [selected.id]: mergeMessages(remote.messages, [...added, ...pending]) }
        if (ref.current.activeId === current.activeId) setMessageCursor(remote.cursor)
      }
      for (const thread of ref.current.threads) if (ref.current.pending.some(item => item.thread.id === thread.id)) merged.set(thread.id, thread)
      patch({ ...ref.current, threads: [...merged.values()].sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt)), activeId: ref.current.activeId === current.activeId ? activeId : ref.current.activeId, messages })
      if (mounted.current) { setThreadCursor(page.cursor); setError(ref.current.pending.length ? 'No pudimos sincronizar esta conversación. Tu trabajo sigue en este navegador.' : '') }
    } catch { if (mounted.current) setError('No pudimos sincronizar esta conversación. Tu trabajo sigue en este navegador.') }
  }
  useEffect(() => {
    mounted.current = true
    setLoading(true)
    // Import the existing local Resolver history once, without touching it until
    // the new server acknowledges every imported message. No ai_queries dump.
    const initialize = async () => {
      if (scope.scope === 'general' && !localStorage.getItem(`${key}:legacy-imported`)) {
        try {
          const imported = await importLegacyConversations(userId, scope)
          for (const { thread, messages } of imported) {
            if (ref.current.threads.some(item => item.id === thread.id)) continue
            patch({ ...ref.current, threads: [...ref.current.threads, thread], activeId: ref.current.activeId ?? thread.id,
              messages: { ...ref.current.messages, [thread.id]: messages }, pending: [...ref.current.pending, ...messages.map(message => ({ thread, message }))] })
          }
          localStorage.setItem(`${key}:legacy-imported`, 'true')
        } catch { setError('No pudimos importar el historial anterior. Su copia original sigue en este navegador.') }
      }
      await flush(); await refresh()
      if (mounted.current) setLoading(false)
    }
    if (!initializing.current) initializing.current = initialize()
    const changed = (event: StorageEvent) => {
      if (event.key !== key) return
      const other = read(key)
      const signature = (value: Cache) => JSON.stringify({ threads: value.threads.map(thread => `${thread.id}:${thread.updatedAt}:${thread.title}`).sort(), pending: value.pending.map(item => item.message.id).sort() })
      if (signature(other) === signature(ref.current)) return
      const pending = new Map([...ref.current.pending, ...other.pending].map(item => [item.message.id, item]))
      ref.current = { ...ref.current, pending: [...pending.values()] }
      void flush().then(refresh)
    }
    const focused = () => { if (!document.hidden) void flush().then(refresh) }
    window.addEventListener('storage', changed)
    window.addEventListener('online', focused)
    window.addEventListener('focus', focused)
    return () => { mounted.current = false; window.removeEventListener('storage', changed); window.removeEventListener('online', focused); window.removeEventListener('focus', focused) }
  }, [key])
  useEffect(() => { if (initialId) void open(initialId) }, [initialId])
  const open = async (id: string) => {
    setLoading(true)
    try {
      const local = ref.current.threads.find(thread => thread.id === id)
      const thread = local ?? await getThread(userId, id)
      if (!thread || !sameScope(thread, scope) || thread.archivedAt) throw new Error('Conversation unavailable')
      patch({ ...ref.current, activeId: id, threads: [thread, ...ref.current.threads.filter(item => item.id !== id)] })
      const snapshotIds = new Set((ref.current.messages[id] ?? []).map(item => item.id))
      const page = await getMessages(userId, id)
      // An unsynced chat remains intact while connectivity is restored.
      const pending = ref.current.pending.filter(item => item.thread.id === id).map(item => item.message)
      const added = (ref.current.messages[id] ?? []).filter(item => !snapshotIds.has(item.id))
      patch({ ...ref.current, messages: { ...ref.current.messages, [id]: mergeMessages(page.messages, [...added, ...pending]) } })
      if (ref.current.activeId === id) setMessageCursor(page.cursor)
      if (!ref.current.pending.length) setError('')
    } catch { setError('No pudimos sincronizar esta conversación. Tu trabajo sigue en este navegador.') }
    finally { setLoading(false) }
  }
  const append = (role: ConversationMessage['role'], content: string, metadata: ConversationMetadata = {}, images: ImageAttachment[] = [], threadId?: string) => {
    const current = ref.current
    const active = current.threads.find(thread => thread.id === (threadId ?? current.activeId))
    if (threadId && !active) throw new Error('La conversación ya no está disponible.')
    const thread = active ?? createThread(scope, content)
    const now = new Date().toISOString()
    const id = crypto.randomUUID()
    const message = { id, threadId: thread.id, role, content, createdAt: now, metadata: images.length ? { ...metadata,
      imageCount: images.length, attachments: imageMetadata(userId, thread.id, id, images), attachmentsReady: false } : metadata }
    if (images.length) {
      localImages.current.set(id, images)
      void storeResolverImages(userId, scopeKey, id, images).catch(() => setError('Las imágenes siguen en esta sesión, pero no pudimos conservar su copia local.'))
    }
    const updated = { ...thread, updatedAt: now, lastMessageAt: now }
    patch({ ...current, activeId: thread.id, threads: [updated, ...current.threads.filter(item => item.id !== thread.id)],
      messages: { ...current.messages, [thread.id]: [...(current.messages[thread.id] ?? []), message] },
      pending: [...current.pending, { thread: updated, message }] })
    void flush()
    return message
  }
  const startNew = () => { patch({ ...ref.current, activeId: null }); setMessageCursor(undefined) }
  const remove = (id: string, deleted = false, remoteMessageIds: string[] = []) => {
    const messageIds = [...remoteMessageIds, ...(ref.current.messages[id] ?? []).map(item => item.id)]
    if (deleted) {
    void clearResolverImages(userId, scopeKey, messageIds).catch(() => {})
    if (scope.scope === 'general') {
      void clearResolverImages(userId, scope.workspaceId, messageIds).catch(() => {})
      void eraseLegacyConversation(userId, scope, id).catch(() => setError('La conversación remota fue eliminada, pero no pudimos limpiar su copia anterior en este navegador.'))
      try { const legacyKey = `nexo-study-resolver-chats-v1:${userId}:${scope.workspaceId}`; const legacy = JSON.parse(localStorage.getItem(legacyKey) ?? '[]'); localStorage.setItem(legacyKey, JSON.stringify(legacy.filter((item: { id: string }) => item.id !== id))) } catch { /* Remote deletion already succeeded. */ }
    }
    }
    const messages = { ...ref.current.messages }; delete messages[id]
    patch({ ...ref.current, activeId: ref.current.activeId === id ? null : ref.current.activeId,
      threads: ref.current.threads.filter(item => item.id !== id), messages, pending: ref.current.pending.filter(item => item.thread.id !== id) })
  }
  const prepareMutation = async (id: string, deleting: boolean) => {
    await flush()
    if (!deleting && ref.current.pending.some(item => item.thread.id === id)) throw new Error('Conversation not synchronized')
  }
  const loadEarlier = async () => {
    const id = ref.current.activeId
    if (!id || !messageCursor || loading) return
    setLoading(true)
    try {
      const page = await getMessages(userId, id, messageCursor)
      patch({ ...ref.current, messages: { ...ref.current.messages, [id]: mergeMessages(ref.current.messages[id] ?? [], page.messages) } })
      setMessageCursor(page.cursor)
    } catch { setError('No pudimos cargar los mensajes anteriores. Reintenta con conexión.') }
    finally { setLoading(false) }
  }
  return { userId, scope, threads: cache.threads, activeId: cache.activeId, activeThread: cache.threads.find(item => item.id === cache.activeId),
    messages: cache.activeId ? cache.messages[cache.activeId] ?? [] : [], error, loading, syncing, messageCursor, threadCursor,
    append, open, startNew, remove, prepareMutation, refresh, loadEarlier, sync: flush, retry: () => void flush().then(refresh) }
}
