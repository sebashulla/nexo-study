import { useEffect, useRef, useState } from 'react'
import { useAuth } from './auth/AuthContext'
import { callAI } from './lib/aiClient'
import { prepareImages, type ImageAttachment } from './lib/imageUtils'
import { ResponseRenderer } from './ResponseRenderer'
import { ChatComposer } from './ChatComposer'
import type { SolutionDraft } from './types'
import { loadResolverImages } from './lib/resolverAttachments'
import { useConversationDraft } from './hooks/useConversationDraft'
import { useConversation } from './hooks/useConversation'
import { ConversationTools, EarlierMessages } from './ConversationTools'
import { loadMessageImages } from './lib/conversationRepository'
import { conversationScopeKey, type ConversationMessage } from './lib/conversationTypes'
import { buildMemoryContext } from './lib/learningMemory'
import { aiErrorMessage } from './lib/aiClient'

const suggestions: Record<string, string[]> = {
  General: ['Explícame esto paso a paso', 'Resume la idea central', '¿Cuál es la respuesta y por qué?'],
  Matemáticas: ['Resuelve paso a paso y comprueba el resultado', '¿Qué fórmula debo usar?', 'Muéstrame el método más corto'],
  Biología: ['Explica la función de esta estructura', '¿Qué conceptos debo recordar?', 'Compara estas dos alternativas'],
  Química: ['Balancea y explica el procedimiento', 'Identifica el concepto clave', 'Resuelve mostrando unidades'],
  Historia: ['Ubica el hecho en su contexto', 'Explica causas y consecuencias', '¿Qué diferencia estas alternativas?'],
}
const categories = Object.keys(suggestions)

type PendingRequest = { threadId: string; question: string; category: string; deep: boolean; images: ImageAttachment[]; context: string }
export function ResolverPage({ workspaceId, initialThreadId, onSave, onPractice, onSaveAsNote }: {
  workspaceId: string; initialThreadId?: string; onSave: (draft: SolutionDraft) => void;
  onPractice?: (question: string, answer: string) => void; onSaveAsNote: (question: string,answer: string) => void
}) {
  const { user } = useAuth()
  const conversation = useConversation({ scope: 'general', workspaceId }, initialThreadId)
  const [category, setCategory] = useState('General')
  const [deep, setDeep] = useState(false)
  const [question, setQuestion] = useConversationDraft(user!.id, conversationScopeKey(conversation.scope))
  const [images, setImages] = useState<ImageAttachment[]>([])
  const [imageBusy, setImageBusy] = useState(false)
  const [busy, setBusy] = useState(false)
  const [thinkingStage, setThinkingStage] = useState(0)
  const [error, setError] = useState('')
  const [failedRequest, setFailedRequest] = useState<PendingRequest | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const messageListRef = useRef<HTMLDivElement>(null)
  const previousSelection = useRef(conversation.activeId)
  const { messages, activeThread } = conversation
  useEffect(() => {
    if (previousSelection.current === conversation.activeId) return
    previousSelection.current = conversation.activeId
    setQuestion(''); setImages([]); setError(''); setFailedRequest(null)
  }, [conversation.activeId])
  const first = messages.find(item => item.role === 'user')
  useEffect(() => {
    if (first) { setCategory(first.metadata.category ?? 'General'); setDeep(first.metadata.deep ?? false) }
  }, [first?.id, first?.metadata.category, first?.metadata.deep])
  useEffect(() => {
    if (!busy) return
    const timer = window.setInterval(() => setThinkingStage(stage => (stage + 1) % 3), 1400)
    return () => window.clearInterval(timer)
  }, [busy])
  useEffect(() => {
    const list = messageListRef.current
    if (list) list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' })
  }, [conversation.activeId, messages.length, thinkingStage, error])
  const importImages = async (files: File[]) => {
    if (!files.length) return
    setImageBusy(true); setError('')
    try { setImages(await prepareImages(files, images)) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudieron preparar las imágenes.') }
    finally { setImageBusy(false) }
  }
  const requestAnswer = async (request: PendingRequest) => {
    setBusy(true); setThinkingStage(0); setError(''); setFailedRequest(null)
    try {
      const answer = await callAI({ task: 'solve', question: request.question, category: request.category,
        mode: request.deep ? 'deep' : 'standard', deep: request.deep, context: request.context, images: request.images })
      conversation.append('assistant', answer, {}, [], request.threadId)
      setQuestion(''); setImages([])
      textareaRef.current?.focus()
    } catch (cause) {
      setFailedRequest(request); setError(aiErrorMessage(cause))
      setQuestion(request.question)
    } finally { setBusy(false) }
  }
  const send = () => {
    if (busy || imageBusy || conversation.loading) return
    const prompt = question.trim()
    if (!prompt && !images.length) { setError('Escribe una pregunta o adjunta al menos una imagen.'); return }
    if (failedRequest && prompt === failedRequest.question) { void requestAnswer(failedRequest); return }
    const text = prompt || 'Analiza las imágenes adjuntas'
    const context = buildMemoryContext({ messages })
    const turn = conversation.append('user', text, { category, deep }, images)
    const request = { threadId: turn.threadId, question: prompt || 'Resuelve los ejercicios o analiza el caso mostrado en las imágenes.', category, deep, images, context }
    setQuestion(''); setImages([])
    void requestAnswer(request)
  }
  const copyAnswer = async (message: ConversationMessage) => {
    try { await navigator.clipboard.writeText(message.content); setCopiedId(message.id); window.setTimeout(() => setCopiedId(null), 1600) }
    catch { setError('No pudimos copiar la respuesta. Puedes seleccionar el texto.') }
  }
  const sourceFor = (message: ConversationMessage) => messages.slice(0, messages.findIndex(item => item.id === message.id)).reverse().find(item => item.role === 'user')
  const saveAnswer = async (message: ConversationMessage) => {
    if (!activeThread || !user) return
    const source = sourceFor(message)
    if (!source) { setError('Carga los mensajes anteriores para recuperar la pregunta de esta respuesta.'); return }
    try {
      let attachments = source.metadata.imageCount ? await loadResolverImages(user.id, conversationScopeKey(conversation.scope), source.id).catch(() => []) : []
      if (!attachments.length && source.metadata.imageCount) attachments = await loadResolverImages(user.id, workspaceId, source.id).catch(() => [])
      if (!attachments.length && source.metadata.attachmentsReady) attachments = await loadMessageImages(source)
      onSave({ question: source.content, answer: message.content, category: source.metadata.category ?? category,
        sourceKey: `${activeThread.id}:${message.id}`, images: attachments, expectedImages: source.metadata.imageCount ?? 0 })
    } catch { setError('No pudimos recuperar las imágenes de esta pregunta. Reintenta con conexión.') }
  }
  const stages = category === 'Matemáticas' ? ['Pensando en el procedimiento…', 'Calculando paso a paso…', 'Comprobando el resultado…'] :
    ['Pensando en tu pregunta…', 'Relacionando los conceptos…', 'Preparando una explicación clara…']
  return <section className="solver-shell">
    <div className="solver-heading"><p className="solver-subtitle">Pregunta, adjunta imágenes y sigue profundizando en la misma conversación.</p></div>
    <ConversationTools conversation={conversation} busy={busy} resolver context={workspaceId === 'general' ? 'General' : 'General · espacio actual'}/>
    <div className="solver-layout no-history history-hidden"><div className="solver-chat"><div className="solver-messages" ref={messageListRef} aria-label="Conversación con Nexo IA">
      <EarlierMessages conversation={conversation}/>
      {messages.length ? messages.map(message => message.role === 'user'
        ? <div className="solver-turn user" key={message.id}><div className="solver-user-bubble"><p>{message.content}</p>{!!message.metadata.imageCount && <small>📎 {message.metadata.imageCount} {message.metadata.imageCount === 1 ? 'imagen' : 'imágenes'}</small>}</div></div>
        : <div className="solver-turn assistant" key={message.id}><span className="solver-avatar" aria-hidden="true">✦</span><div className="solver-assistant-bubble"><div className="solver-message-head"><strong>Nexo IA</strong><div className="solver-answer-actions"><button onClick={() => void copyAnswer(message)}>{copiedId === message.id ? '✓ Copiado' : 'Copiar'}</button><button onClick={() => void saveAnswer(message)}>Guardar</button><button onClick={() => onSaveAsNote(sourceFor(message)?.content ?? 'Respuesta de Nexo',message.content)}>Guardar como apunte</button>{onPractice && <button onClick={() => onPractice(sourceFor(message)?.content ?? activeThread?.title ?? '', message.content)}>Practicar esto</button>}</div></div><div className="solver-answer"><ResponseRenderer text={message.content}/></div></div></div>)
        : <div className="solver-empty"><span>✦</span><h3>¿Qué quieres resolver?</h3><p>Escribe una duda o adjunta una imagen. Después puedes seguir preguntando sin perder el contexto.</p><div className="solver-prompts">{(suggestions[category] || suggestions.General).map(suggestion => <button key={suggestion} onClick={() => { setQuestion(suggestion); textareaRef.current?.focus() }}>{suggestion} ↗</button>)}</div></div>}
      {busy && <div className="solver-turn assistant solver-thinking" role="status"><span className="solver-avatar" aria-hidden="true">✦</span><div className="solver-thinking-bubble"><span className="solver-thinking-dots" aria-hidden="true"><i/><i/><i/></span><strong>{stages[thinkingStage]}</strong><small>Nexo está preparando tu respuesta</small></div></div>}
      {error && <div className="solver-error" role="alert"><span>{error}</span>{failedRequest && <button onClick={() => void requestAnswer(failedRequest)}>Reintentar</button>}</div>}
    </div><ChatComposer className="solver-composer" value={question} onChange={setQuestion} onSend={send} label="Escribe tu pregunta" placeholder="Pregunta lo que quieras resolver…" busy={busy} textareaRef={textareaRef} images={images} onImport={files => void importImages(files)} onRemove={id => setImages(current => current.filter(item => item.id !== id))} imageBusy={imageBusy} deep={deep} onDeepChange={setDeep} sendLabel="Enviar pregunta" enterToSend>
      <div className="solver-categories" role="group" aria-label="Materia">{categories.map(item => <button key={item} className={category === item ? 'active' : ''} onClick={() => setCategory(item)} disabled={busy}>{item}</button>)}</div>
    </ChatComposer></div></div>
  </section>
}
