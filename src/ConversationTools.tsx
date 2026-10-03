import { lazy, Suspense, useState } from 'react'
import type { useConversation } from './hooks/useConversation'
const History = lazy(() => import('./ConversationHistory').then(module => ({ default: module.ConversationHistory })))
export type ConversationController = ReturnType<typeof useConversation>
export function ConversationTools({ conversation, busy = false, context, resolver = false }: {
  conversation: ConversationController; busy?: boolean; context: string; resolver?: boolean
}) {
  const [open, setOpen] = useState(false)
  return <><div className="conversation-tools"><small className="conversation-context">Contexto: {context}</small><div>
    <button className="secondary solver-history-toggle" aria-label={open ? "Ocultar conversaciones" : "Mostrar conversaciones"} aria-expanded={open} onClick={() => setOpen(value => !value)} disabled={busy}>{resolver ? open ? 'Ocultar conversaciones' : 'Mostrar conversaciones' : 'Conversaciones'}</button>
    {(!resolver || conversation.messages.length > 0) && <button className="secondary" title="Nueva conversación" onClick={conversation.startNew} disabled={busy}>＋ {resolver ? 'Nuevo chat' : 'Nueva conversación'}</button>}
  </div></div>
  {conversation.error && <div className="conversation-sync-notice" aria-live="polite"><span>{conversation.error}</span><button className="text-button" onClick={conversation.retry} disabled={conversation.syncing}>Reintentar sincronización</button></div>}
  {open && <Suspense fallback={<p>Cargando historial…</p>}><History userId={conversation.userId} scope={conversation.scope} threads={conversation.threads} activeId={conversation.activeId}
    onOpen={id => void conversation.open(id)} onNew={conversation.startNew} onRemove={conversation.remove} onBeforeAction={conversation.prepareMutation} onChange={() => void conversation.refresh()} onClose={() => setOpen(false)}/></Suspense>}
  </>
}
export function EarlierMessages({ conversation }: { conversation: ConversationController }) {
  return conversation.messageCursor ? <button className="secondary conversation-earlier" disabled={conversation.loading} onClick={() => void conversation.loadEarlier()}>Cargar anteriores</button> : null
}
