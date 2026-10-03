import { supabase } from './supabase'
import type { SolutionAttachment } from '../types'
import type { ImageAttachment } from './imageUtils'
import { conversationTitle, type ConversationCursor, type ConversationMessage, type ConversationMetadata, type ConversationScope, type ConversationThread } from './conversationTypes'

const THREAD_PAGE = 25
const MESSAGE_PAGE = 40
function client() { if (!supabase) throw new Error('No pudimos sincronizar esta conversación.'); return supabase }
type Row = Record<string, unknown>
export function mapThread(row: Row): ConversationThread {
  return { id: String(row.id), title: String(row.title), scope: row.scope as ConversationScope['scope'],
    workspaceId: String(row.workspace_id ?? 'general'), courseId: row.course_id as string || undefined,
    materialId: row.material_id as string || undefined, createdAt: String(row.created_at), updatedAt: String(row.updated_at),
    synced: true, lastMessageAt: String(row.last_message_at), archivedAt: row.archived_at as string || undefined }
}
export function mapMessage(row: Row): ConversationMessage {
  return { id: String(row.id), threadId: String(row.thread_id), role: row.role as ConversationMessage['role'],
    content: String(row.content), createdAt: String(row.created_at), metadata: (row.metadata ?? {}) as ConversationMetadata }
}
export function createThread(scope: ConversationScope, firstMessage: string): ConversationThread {
  const now = new Date().toISOString()
  return { ...scope, id: crypto.randomUUID(), title: conversationTitle(firstMessage), createdAt: now, updatedAt: now, lastMessageAt: now }
}
export async function listThreads(userId: string, scope: ConversationScope, options: { cursor?: ConversationCursor; search?: string; archived?: boolean } = {}) {
  let query = client().from('conversation_threads').select('*').eq('user_id', userId).eq('scope', scope.scope)
  if (scope.scope === 'general') query = scope.workspaceId === 'general' ? query.is('workspace_id', null) : query.eq('workspace_id', scope.workspaceId)
  else if (scope.scope === 'course') query = query.eq('course_id', scope.courseId!)
  else query = query.eq('course_id', scope.courseId!).eq('material_id', scope.materialId!)
  query = options.archived ? query.not('archived_at', 'is', null) : query.is('archived_at', null)
  const term = options.search?.trim().replace(/[%_,.()]/g, '').slice(0, 80)
  if (term) query = query.ilike('title', `%${term}%`)
  if (options.cursor) query = query.or(`last_message_at.lt.${options.cursor.at},and(last_message_at.eq.${options.cursor.at},id.lt.${options.cursor.id})`)
  const { data, error } = await query.order('last_message_at', { ascending: false }).order('id', { ascending: false }).limit(THREAD_PAGE + 1)
  if (error) throw error
  const rows = (data ?? []).map(mapThread)
  const threads = rows.slice(0, THREAD_PAGE)
  const last = threads.slice(-1)[0]
  return { threads, cursor: rows.length > THREAD_PAGE && last ? { at: last.lastMessageAt, id: last.id } : undefined }
}
export async function getThread(userId: string, id: string) {
  const { data, error } = await client().from('conversation_threads').select('*').eq('user_id', userId).eq('id', id).maybeSingle()
  if (error) throw error
  return data ? mapThread(data) : undefined
}
export async function getMessages(userId: string, threadId: string, cursor?: ConversationCursor) {
  let query = client().from('conversation_messages').select('*').eq('user_id', userId).eq('thread_id', threadId)
  if (cursor) query = query.or(`created_at.lt.${cursor.at},and(created_at.eq.${cursor.at},id.lt.${cursor.id})`)
  const { data, error } = await query.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(MESSAGE_PAGE + 1)
  if (error) throw error
  const rows = (data ?? []).map(mapMessage)
  const messages = rows.slice(0, MESSAGE_PAGE).reverse()
  const first = messages[0]
  return { messages, cursor: rows.length > MESSAGE_PAGE && first ? { at: first.createdAt, id: first.id } : undefined }
}
export async function appendMessage(thread: ConversationThread, message: ConversationMessage) {
  const { data, error } = await client().rpc('append_conversation_message', {
    // Course/material location follows its course membership; moving or deleting
    // a workspace must not invalidate that conversation's independent context.
    p_thread: { ensure_existing: thread.synced === true, id: thread.id, title: thread.title, scope: thread.scope, workspace_id: thread.scope === 'general' && thread.workspaceId !== 'general' ? thread.workspaceId : null,
      course_id: thread.courseId ?? null, material_id: thread.materialId ?? null },
    p_message: { id: message.id, role: message.role, content: message.content, metadata: message.metadata },
  })
  if (error || !data?.thread || !data?.message) throw error ?? new Error('No pudimos sincronizar esta conversación.')
  return { thread: mapThread(data.thread), message: mapMessage(data.message) }
}
export async function renameThread(userId: string, id: string, title: string) {
  const clean = title.trim().slice(0, 180)
  if (!clean) throw new Error('Escribe un título para la conversación.')
  const { data, error } = await client().from('conversation_threads').update({ title: clean }).eq('user_id', userId).eq('id', id).select('*').single()
  if (error || !data) throw error ?? new Error('No pudimos renombrar la conversación.')
  return mapThread(data)
}
export async function archiveThread(userId: string, id: string, archived = true) {
  const { data, error } = await client().from('conversation_threads').update({ archived_at: archived ? new Date().toISOString() : null }).eq('user_id', userId).eq('id', id).select('*').single()
  if (error || !data) throw error ?? new Error('No pudimos archivar la conversación.')
  return mapThread(data)
}
export async function deleteThread(userId: string, id: string) {
  // Delete own Storage objects first. A failed cleanup keeps the thread reviewable.
  let cursor: ConversationCursor | undefined
  const messageIds: string[] = []
  do {
    const page = await getMessages(userId, id, cursor)
    messageIds.push(...page.messages.map(message => message.id))
    const paths = page.messages.flatMap(message => message.metadata.attachments?.map(image => image.storagePath) ?? [])
    if (paths.length) {
      const { error } = await client().storage.from('conversation-images').remove(paths)
      if (error) throw error
    }
    cursor = page.cursor
  } while (cursor)
  const { error } = await client().from('conversation_threads').delete().eq('user_id', userId).eq('id', id)
  if (error) throw error
  return messageIds
}
export async function searchThreads(userId: string, question: string, workspaceId: string, courseIds: string[]) {
  const term = question.trim().replace(/[%_,.()]/g, '').slice(0, 80)
  if (term.length < 2) return []
  // The server applies owner RLS independently. Search reads titles, never message bodies.
  let query = client().from('conversation_threads').select('*').eq('user_id', userId).is('archived_at', null).ilike('title', `%${term}%`)
  const safeIds = courseIds.filter(id => /^[a-zA-Z0-9_-]+$/.test(id))
  const workspace = workspaceId === 'general' ? 'workspace_id.is.null' : `workspace_id.eq.${workspaceId}`
  query = query.or(`and(scope.eq.general,${workspace})${safeIds.length ? `,course_id.in.(${safeIds.join(',')})` : ''}`)
  const { data, error } = await query.order('last_message_at', { ascending: false }).limit(15)
  if (error) throw error
  return (data ?? []).map(mapThread)
}
export function imageMetadata(userId: string, threadId: string, messageId: string, images: ImageAttachment[]): SolutionAttachment[] {
  return images.map((image, index) => ({ storagePath: `${userId}/${threadId}/${messageId}/${index}.${image.mimeType === 'image/png' ? 'png' : image.mimeType === 'image/jpeg' ? 'jpg' : 'webp'}`,
    mimeType: image.mimeType as SolutionAttachment['mimeType'], name: image.name.slice(0, 180), bytes: image.bytes }))
}
export async function syncMessageImages(userId: string, message: ConversationMessage, images: ImageAttachment[]) {
  if (!images.length || images.length !== message.metadata.attachments?.length) throw new Error('Las imágenes pendientes no están disponibles en este navegador.')
  for (let i = 0; i < images.length; i++) {
    const blob = await (await fetch(images[i].dataUrl)).blob()
    const { error } = await client().storage.from('conversation-images').upload(message.metadata.attachments[i].storagePath, blob, { contentType: images[i].mimeType, upsert: false })
    if (error && !/already exists|duplicate/i.test(error.message)) throw error
  }
  const metadata = { ...message.metadata, attachmentsReady: true }
  const { error } = await client().from('conversation_messages').update({ metadata }).eq('user_id', userId).eq('id', message.id)
  if (error) throw error
  return { ...message, metadata }
}
export async function loadMessageImages(message: ConversationMessage): Promise<ImageAttachment[]> {
  if (!message.metadata.attachmentsReady) return []
  return Promise.all((message.metadata.attachments ?? []).map(async (item, i) => {
    const { data, error } = await client().storage.from('conversation-images').download(item.storagePath)
    if (error || !data) throw error ?? new Error('No pudimos recuperar las imágenes.')
    const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(data) })
    return { ...item, id: `${message.id}:${i}`, dataUrl }
  }))
}
