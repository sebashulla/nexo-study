import type { SolutionAttachment } from '../types'

export type ConversationScope = { scope: 'general' | 'course' | 'material'; workspaceId: string; courseId?: string; materialId?: string }
export type ConversationSource = { materialId: string; materialTitle: string; pageStart: number; pageEnd: number }
export type ConversationMetadata = {
  sources?: ConversationSource[]; page?: number; category?: string; deep?: boolean;
  imageCount?: number; attachments?: SolutionAttachment[]; attachmentsReady?: boolean;
  concept?: string; practiceContext?: string;
}
export type ConversationThread = ConversationScope & {
  id: string; title: string; createdAt: string; updatedAt: string; lastMessageAt: string; archivedAt?: string; synced?: boolean;
}
export type ConversationMessage = { id: string; threadId: string; role: 'user' | 'assistant'; content: string; createdAt: string; metadata: ConversationMetadata }
export type ConversationCursor = { at: string; id: string }
export const conversationScopeKey = (scope: ConversationScope) => `${scope.scope}:${scope.scope === 'general' ? scope.workspaceId : scope.materialId ?? scope.courseId}`
export function conversationTitle(question: string) {
  const text = question.replace(/\s+/g, ' ').trim()
  return text.length <= 72 ? text : `${text.slice(0, 69).replace(/\s+\S*$/, '')}…`
}
