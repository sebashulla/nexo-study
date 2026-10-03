import { createThread, imageMetadata } from './conversationRepository'
import { loadResolverImages, storeResolverImages, clearResolverImages } from './resolverAttachments'
import { conversationScopeKey, type ConversationMessage, type ConversationScope } from './conversationTypes'

type OldMessage = { id: string; role: 'user' | 'assistant'; text: string; createdAt: string; imageCount?: number }
type OldThread = { id: string; title: string; category: string; deep: boolean; messages: OldMessage[] }
type Mapping = { key: string; oldId?: string; index?: number; images: string[] }
const mappingKey = (user: string, scope: ConversationScope) => `nexo-legacy-conversation-map:${user}:${conversationScopeKey(scope)}`
const uuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id : crypto.randomUUID()
export async function importLegacyConversations(userId: string, scope: ConversationScope) {
  const scopeKey = conversationScopeKey(scope)
  let key = `nexo-study-resolver-chats-v1:${userId}:${scope.workspaceId}`
  let raw = localStorage.getItem(key)
  let old: OldThread[]
  const mapping: Record<string, Mapping> = JSON.parse(localStorage.getItem(mappingKey(userId, scope)) ?? '{}')
  if (raw) old = JSON.parse(raw)
  else {
    key = `nexo-study-resolver-history-v4:${userId}:${scope.workspaceId}`
    raw = localStorage.getItem(key)
    if (!raw && scope.workspaceId === 'general') { key = `nexo-study-resolver-history-v3:${userId}`; raw = localStorage.getItem(key) }
    const rows = JSON.parse(raw ?? '[]') as { question: string; answer: string; category?: string; deep?: boolean; createdAt?: string }[]
    old = rows.map((row, index) => ({ id: `legacy-${index}`, title: row.question, category: row.category ?? 'General', deep: !!row.deep,
      messages: [{ id: `legacy-user-${index}`, role: 'user', text: row.question, createdAt: row.createdAt ?? '' }, { id: `legacy-answer-${index}`, role: 'assistant', text: row.answer, createdAt: row.createdAt ?? '' }] }))
  }
  const imported = []
  for (const [index, legacy] of old.slice(0, 25).entries()) {
    if (!Array.isArray(legacy.messages) || !legacy.messages.length) continue
    const mappedId = Object.keys(mapping).find(id => mapping[id].key === key && (mapping[id].oldId === legacy.id || mapping[id].index === index))
    const thread = { ...createThread(scope, legacy.title), id: mappedId ?? uuid(legacy.id) }
    const messages: ConversationMessage[] = []
    for (const item of legacy.messages) {
      if (!item.text || !['user', 'assistant'].includes(item.role)) continue
      const id = uuid(item.id)
      const images = item.imageCount ? await loadResolverImages(userId, scope.workspaceId, item.id) : []
      if (images.length) await storeResolverImages(userId, scopeKey, id, images)
      messages.push({ id, threadId: thread.id, role: item.role, content: item.text, createdAt: item.createdAt || thread.createdAt,
        metadata: { category: legacy.category, deep: legacy.deep, imageCount: images.length,
          ...(images.length ? { attachments: imageMetadata(userId, thread.id, id, images), attachmentsReady: false } : {}) } })
    }
    if (!messages.length) continue
    mapping[thread.id] = { key, ...(key.includes('chats-v1:') ? { oldId: legacy.id } : { index }), images: legacy.messages.map(item => item.id) }
    imported.push({ thread, messages })
  }
  localStorage.setItem(mappingKey(userId, scope), JSON.stringify(mapping))
  return imported
}
export async function eraseLegacyConversation(userId: string, scope: ConversationScope, id: string) {
  const key = mappingKey(userId, scope)
  const mapping: Record<string, Mapping> = JSON.parse(localStorage.getItem(key) ?? '{}')
  const source = mapping[id]
  if (!source) return
  const old = JSON.parse(localStorage.getItem(source.key) ?? '[]') as { id?: string }[]
  localStorage.setItem(source.key, JSON.stringify(old.filter((row, index) => source.oldId ? row.id !== source.oldId : index !== source.index)))
  if (source.index !== undefined) for (const value of Object.values(mapping)) if (value.key === source.key && value.index !== undefined && value.index > source.index) value.index--
  await clearResolverImages(userId, scope.workspaceId, source.images)
  delete mapping[id]; localStorage.setItem(key, JSON.stringify(mapping))
}
