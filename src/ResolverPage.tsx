import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useAuth } from './auth/AuthContext'
import { callAI } from './lib/aiClient'
import { imageLimits, prepareImages, type ImageAttachment } from './lib/imageUtils'
import { supabase } from './lib/supabase'
import { ResponseRenderer } from './ResponseRenderer'
import { Icon } from './Icon'

type ChatMessage = { id: string; role: 'user' | 'assistant'; text: string; createdAt: string; imageCount?: number; remoteId?: string }
type ChatThread = { id: string; title: string; category: string; deep: boolean; createdAt: string; updatedAt: string; messages: ChatMessage[] }
type PendingRequest = { threadId: string; question: string; category: string; deep: boolean; images: ImageAttachment[]; context?: string }
type LegacyItem = { id?: string; question: string; category: string; answer: string; createdAt: string; deep: boolean; imageCount: number }

const CHAT_PREFIX = 'nexo-study-resolver-chats-v1:'
const HISTORY_PREFIX = 'nexo-study-resolver-history-v4:'
const LEGACY_HISTORY_PREFIX = 'nexo-study-resolver-history-v3:'
const HISTORY_PANEL_PREFIX = 'nexo-study-resolver-panel:'
const chatKey = (userId: string, workspaceId: string) => `${CHAT_PREFIX}${userId}:${workspaceId}`
const newId = () => crypto.randomUUID()

function loadThreads(userId: string, workspaceId: string): ChatThread[] {
  try {
    const saved = localStorage.getItem(chatKey(userId, workspaceId))
    if (saved) {
      const parsed: unknown = JSON.parse(saved)
      if (Array.isArray(parsed)) return parsed.filter((thread): thread is ChatThread =>
        thread && typeof thread.id === 'string' && typeof thread.title === 'string' && Array.isArray(thread.messages) &&
        thread.messages.every((message: ChatMessage) => message && typeof message.text === 'string' && (message.role === 'user' || message.role === 'assistant')))
    }
    const old = localStorage.getItem(`${HISTORY_PREFIX}${userId}:${workspaceId}`)
      ?? (workspaceId === 'general' ? localStorage.getItem(`${LEGACY_HISTORY_PREFIX}${userId}`) : null)
    const legacy: unknown = JSON.parse(old || '[]')
    if (!Array.isArray(legacy)) return []
    return legacy.filter((item): item is LegacyItem => item && typeof item.question === 'string' && typeof item.answer === 'string').map((item, index) => ({
      id: `legacy-${index}-${item.createdAt || index}`,
      title: item.question,
      category: item.category || 'General',
      deep: Boolean(item.deep),
      createdAt: item.createdAt || new Date().toISOString(),
      updatedAt: item.createdAt || new Date().toISOString(),
      messages: [
        { id: `legacy-user-${index}`, role: 'user' as const, text: item.question, createdAt: item.createdAt || '', imageCount: item.imageCount || 0 },
        { id: `legacy-answer-${index}`, role: 'assistant' as const, text: item.answer, createdAt: item.createdAt || '', remoteId: item.id },
      ],
    }))
  } catch { return [] }
}

const suggestions: Record<string, string[]> = {
  General: ['Explícame esto paso a paso', 'Resume la idea central', '¿Cuál es la respuesta y por qué?'],
  Matemáticas: ['Resuelve paso a paso y comprueba el resultado', '¿Qué fórmula debo usar?', 'Muéstrame el método más corto'],
  Biología: ['Explica la función de esta estructura', '¿Qué conceptos debo recordar?', 'Compara estas dos alternativas'],
  Química: ['Balancea y explica el procedimiento', 'Identifica el concepto clave', 'Resuelve mostrando unidades'],
  Historia: ['Ubica el hecho en su contexto', 'Explica causas y consecuencias', '¿Qué diferencia estas alternativas?'],
}
const categories = Object.keys(suggestions)

export function ResolverPage({ workspaceId, feedback }: { workspaceId: string; feedback?: ReactNode }) {
  const { user } = useAuth()
  const [initialThreads] = useState<ChatThread[]>(() => user ? loadThreads(user.id, workspaceId) : [])
  const [threads, setThreads] = useState(initialThreads)
  const [activeId, setActiveId] = useState<string | null>(initialThreads[0]?.id ?? null)
  const [category, setCategory] = useState(initialThreads[0]?.category ?? 'General')
  const [deep, setDeep] = useState(initialThreads[0]?.deep ?? false)
  const [question, setQuestion] = useState('')
  const [images, setImages] = useState<ImageAttachment[]>([])
  const [dragging, setDragging] = useState(false)
  const [imageBusy, setImageBusy] = useState(false)
  const [busy, setBusy] = useState(false)
  const [thinkingStage, setThinkingStage] = useState(0)
  const [error, setError] = useState('')
  const [failedRequest, setFailedRequest] = useState<PendingRequest | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = useState(() => {
    if (window.matchMedia('(max-width: 700px)').matches) return false
    try {
      const saved = user && localStorage.getItem(`${HISTORY_PANEL_PREFIX}${user.id}:${workspaceId}`)
      return saved === null || saved === undefined ? true : saved === 'true'
    } catch { return true }
  })
  const fileRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const messageListRef = useRef<HTMLDivElement>(null)
  const historyRef = useRef<HTMLElement>(null)
  const historyToggleRef = useRef<HTMLButtonElement>(null)
  const activeThread = threads.find(thread => thread.id === activeId)

  useEffect(() => {
    if (!user) return
    try { localStorage.setItem(chatKey(user.id, workspaceId), JSON.stringify(threads.slice(0, 25))) }
    catch { setError('No pudimos guardar esta conversación en el navegador. Libera espacio de almacenamiento.') }
  }, [threads, user, workspaceId])

  useEffect(() => {
    if (!user || window.matchMedia('(max-width: 700px)').matches) return
    try { localStorage.setItem(`${HISTORY_PANEL_PREFIX}${user.id}:${workspaceId}`, String(historyOpen)) }
    catch { /* History stays usable for this session. */ }
  }, [historyOpen, user, workspaceId])

  useEffect(() => {
    const mobile = window.matchMedia('(max-width: 700px)')
    const closeOnMobile = (event: MediaQueryListEvent) => { if (event.matches) setHistoryOpen(false) }
    mobile.addEventListener('change', closeOnMobile)
    return () => mobile.removeEventListener('change', closeOnMobile)
  }, [])

  useEffect(() => {
    if (!historyOpen || !window.matchMedia('(max-width: 700px)').matches) return
    historyRef.current?.focus()
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setHistoryOpen(false); historyToggleRef.current?.focus() }
      if (event.key === 'Tab' && historyRef.current) {
        const focusable = Array.from(historyRef.current.querySelectorAll<HTMLButtonElement>('button:not([disabled])')).filter(button => button.offsetParent !== null)
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (!first || !last) return
        if (event.shiftKey && (document.activeElement === first || document.activeElement === historyRef.current)) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', escape)
    return () => document.removeEventListener('keydown', escape)
  }, [historyOpen])

  useEffect(() => {
    if (!busy) return
    const timer = window.setInterval(() => setThinkingStage(stage => (stage + 1) % 3), 1400)
    return () => window.clearInterval(timer)
  }, [busy])

  useEffect(() => {
    const list = messageListRef.current
    if (list) list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' })
  }, [activeId, activeThread?.messages.length, thinkingStage, error])

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`
  }, [question])

  const importImages = async (files: File[]) => {
    if (!files.length) return
    setImageBusy(true); setError('')
    try { setImages(await prepareImages(files, images)) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudieron preparar las imágenes.') }
    finally { setImageBusy(false); if (fileRef.current) fileRef.current.value = '' }
  }

  const requestAnswer = async (request: PendingRequest) => {
    setBusy(true); setThinkingStage(0); setError(''); setFailedRequest(null)
    try {
      const answer = await callAI({
        task: 'solve', question: request.question, category: request.category,
        mode: request.deep ? 'deep' : 'standard', deep: request.deep,
        context: request.context, images: request.images,
      })
      const answerId = newId()
      const now = new Date().toISOString()
      setThreads(current => current.map(thread => thread.id === request.threadId ? {
        ...thread, updatedAt: now, messages: [...thread.messages, { id: answerId, role: 'assistant' as const, text: answer, createdAt: now }],
      } : thread))
      if (user && supabase) {
        void (async () => {
          const { data } = await supabase.from('ai_queries').insert({
            user_id: user.id, task: 'solve', category: request.category, question: request.question,
            answer, deep: request.deep, image_count: request.images.length,
          }).select('id').single()
          if (data?.id) setThreads(current => current.map(thread => thread.id === request.threadId ? {
            ...thread, messages: thread.messages.map(message => message.id === answerId ? { ...message, remoteId: data.id } : message),
          } : thread))
        })()
      }
    } catch (cause) {
      setFailedRequest(request)
      setError(cause instanceof Error ? cause.message : 'Nexo IA no está disponible en este momento.')
    } finally { setBusy(false) }
  }

  const send = () => {
    if (busy || imageBusy) return
    const prompt = question.trim()
    if (!prompt && !images.length) { setError('Escribe una pregunta o adjunta al menos una imagen.'); return }
    const text = prompt || 'Analiza las imágenes adjuntas'
    const threadId = activeId ?? newId()
    const now = new Date().toISOString()
    const previous = activeThread?.messages ?? []
    const context = previous.slice(-12).map(message => `${message.role === 'user' ? 'Estudiante' : 'Nexo'}: ${message.text}`).join('\n\n').slice(-12000) || undefined
    const activeImages = images
    const turn: ChatMessage = { id: newId(), role: 'user', text, createdAt: now, imageCount: activeImages.length }
    setThreads(current => {
      const existing = current.find(thread => thread.id === threadId)
      if (existing) return [{ ...existing, updatedAt: now, messages: [...existing.messages, turn] }, ...current.filter(thread => thread.id !== threadId)]
      return [{ id: threadId, title: text, category, deep, createdAt: now, updatedAt: now, messages: [turn] }, ...current]
    })
    setActiveId(threadId); setQuestion(''); setImages([])
    void requestAnswer({ threadId, question: prompt || 'Resuelve los ejercicios o analiza el caso mostrado en las imágenes.', category, deep, images: activeImages, context })
  }

  const startNew = () => {
    if (busy) return
    setActiveId(null); setQuestion(''); setImages([]); setCategory('General'); setDeep(false); setError(''); setFailedRequest(null)
  }

  const openThread = (thread: ChatThread) => {
    if (busy) return
    setActiveId(thread.id); setCategory(thread.category); setDeep(thread.deep); setQuestion(''); setImages([]); setError(''); setFailedRequest(null)
    if (window.matchMedia('(max-width: 700px)').matches) setHistoryOpen(false)
  }

  const copyAnswer = async (message: ChatMessage) => {
    try { await navigator.clipboard.writeText(message.text); setCopiedId(message.id); window.setTimeout(() => setCopiedId(null), 1600) }
    catch { /* Clipboard access may be unavailable. */ }
  }

  const clearHistory = async () => {
    if (busy || !window.confirm('¿Borrar todas las conversaciones de este espacio?')) return
    const ids = threads.flatMap(thread => thread.messages.map(message => message.remoteId).filter((id): id is string => Boolean(id)))
    setThreads([]); startNew()
    if (user && workspaceId === 'general') localStorage.removeItem(`${LEGACY_HISTORY_PREFIX}${user.id}`)
    if (user && supabase && ids.length) await supabase.from('ai_queries').delete().eq('user_id', user.id).in('id', ids)
  }

  const stages = category === 'Matemáticas'
    ? ['Pensando en el procedimiento…', 'Calculando paso a paso…', 'Comprobando el resultado…']
    : ['Pensando en tu pregunta…', 'Relacionando los conceptos…', 'Preparando una explicación clara…']

  return <section className="solver-shell">
    <div className="solver-heading"><p className="solver-subtitle">Pregunta, adjunta imágenes y sigue profundizando en la misma conversación.</p><div className="solver-heading-actions">{threads.length > 0 && <button ref={historyToggleRef} className="secondary solver-history-toggle" aria-controls="solver-history" aria-expanded={historyOpen} onClick={() => setHistoryOpen(value => !value)}>{historyOpen ? 'Ocultar conversaciones' : 'Mostrar conversaciones'}</button>}{activeThread && <button className="secondary" onClick={startNew} disabled={busy}>＋ Nuevo chat</button>}{feedback}</div></div>
    {historyOpen && threads.length > 0 && <button className="solver-history-backdrop" aria-label="Cerrar conversaciones" onClick={() => { setHistoryOpen(false); historyToggleRef.current?.focus() }}/>}
    <div className={`solver-layout ${threads.length ? 'has-history' : 'no-history'} ${historyOpen ? 'history-open' : 'history-hidden'}`}>
      {historyOpen && threads.length > 0 && <aside ref={historyRef} className="solver-history" id="solver-history" role={window.matchMedia('(max-width: 700px)').matches ? 'dialog' : undefined} aria-modal={window.matchMedia('(max-width: 700px)').matches ? true : undefined} aria-label="Conversaciones recientes" tabIndex={-1}><div className="solver-history-head"><strong>Conversaciones</strong><button onClick={clearHistory} disabled={busy}>Limpiar</button><button className="solver-history-close" aria-label="Cerrar conversaciones" onClick={() => { setHistoryOpen(false); historyToggleRef.current?.focus() }}><Icon name="close"/></button></div><div className="solver-thread-list">{threads.slice(0, 25).map(thread => <button key={thread.id} className={activeId === thread.id ? 'active' : ''} onClick={() => openThread(thread)} disabled={busy}><span>✦</span><span><strong>{thread.title}</strong><small>{thread.category} · {thread.messages.filter(message => message.role === 'assistant').length} respuestas</small></span></button>)}</div></aside>}
      <div className="solver-chat"><div className="solver-messages" ref={messageListRef} aria-label="Conversación con Nexo IA">
        {activeThread?.messages.length ? activeThread.messages.map(message => message.role === 'user'
          ? <div className="solver-turn user" key={message.id}><div className="solver-user-bubble"><p>{message.text}</p>{Boolean(message.imageCount) && <small>📎 {message.imageCount} {message.imageCount === 1 ? 'imagen' : 'imágenes'}</small>}</div></div>
          : <div className="solver-turn assistant" key={message.id}><span className="solver-avatar" aria-hidden="true">✦</span><div className="solver-assistant-bubble"><div className="solver-message-head"><strong>Nexo IA</strong><button onClick={() => copyAnswer(message)}>{copiedId === message.id ? '✓ Copiado' : 'Copiar'}</button></div><div className="solver-answer"><ResponseRenderer text={message.text}/></div></div></div>)
          : <div className="solver-empty"><span>✦</span><h3>¿Por dónde empezamos?</h3><p>Escribe una duda o adjunta una imagen. Después puedes seguir preguntando sin perder el contexto.</p><div className="solver-prompts">{(suggestions[category] || suggestions.General).map(suggestion => <button key={suggestion} onClick={() => { setQuestion(suggestion); textareaRef.current?.focus() }}>{suggestion} ↗</button>)}</div></div>}
        {busy && <div className="solver-turn assistant solver-thinking" role="status"><span className="solver-avatar" aria-hidden="true">✦</span><div className="solver-thinking-bubble"><span className="solver-thinking-dots" aria-hidden="true"><i/><i/><i/></span><strong>{stages[thinkingStage]}</strong><small>Nexo está preparando tu respuesta</small></div></div>}
        {error && <div className="solver-error" role="alert"><span>{error}</span>{failedRequest && <button onClick={() => void requestAnswer(failedRequest)}>Reintentar</button>}</div>}
      </div>
      <div className={`solver-composer ${dragging ? 'dragging' : ''}`} onDragEnter={event => { event.preventDefault(); setDragging(true) }} onDragOver={event => event.preventDefault()} onDragLeave={event => { if (event.currentTarget === event.target) setDragging(false) }} onDrop={event => { event.preventDefault(); setDragging(false); void importImages(Array.from(event.dataTransfer.files).filter(file => file.type.startsWith('image/'))) }}>
        <div className="solver-categories" role="group" aria-label="Materia">{categories.map(item => <button key={item} className={category === item ? 'active' : ''} onClick={() => setCategory(item)} disabled={busy}>{item}</button>)}</div>
        <input ref={fileRef} hidden multiple type="file" accept="image/png,image/jpeg,image/webp" onChange={event => void importImages(Array.from(event.target.files || []))}/>
        {images.length > 0 && <div className="solver-attachments">{images.map((image, index) => <div key={image.id}><img src={image.dataUrl} alt={`Adjunto ${index + 1}`}/><button aria-label={`Quitar ${image.name}`} onClick={() => setImages(current => current.filter(item => item.id !== image.id))}>×</button></div>)}<small>{images.length}/{imageLimits.maxImages} imágenes</small></div>}
        <textarea ref={textareaRef} aria-label="Escribe tu pregunta" rows={2} placeholder="Pregunta lo que quieras resolver…" value={question} onChange={event => setQuestion(event.target.value)} onPaste={event => { const files = Array.from(event.clipboardData.files).filter(file => file.type.startsWith('image/')); if (files.length) { event.preventDefault(); void importImages(files) } }} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send() } }}/>
        <div className="solver-compose-actions"><button className="solver-attach" onClick={() => fileRef.current?.click()} disabled={busy || imageBusy || images.length >= imageLimits.maxImages} aria-label="Adjuntar imágenes"><Icon name="paperclip"/><span>{imageBusy ? 'Preparando…' : 'Adjuntar imágenes'}</span></button><label className="deep-toggle"><input type="checkbox" checked={deep} onChange={event => setDeep(event.target.checked)} disabled={busy}/><span/><b>Razonamiento reforzado</b></label><button className="solver-send" onClick={send} disabled={busy || imageBusy || (!question.trim() && images.length === 0)} aria-label="Enviar pregunta">{busy ? '···' : '↑'}</button></div>
      </div></div>
    </div>
  </section>
}
