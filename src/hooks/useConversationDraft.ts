import { useState } from 'react'
export function useConversationDraft(userId: string, scopeKey: string, seed = '') {
  const key = `nexo-conversation-draft-v1:${userId}:${scopeKey}`
  const [value, setValue] = useState(() => { if (seed) return seed; try { return localStorage.getItem(key) ?? '' } catch { return '' } })
  const change = (text: string) => {
    setValue(text)
    try { if (text) localStorage.setItem(key, text); else localStorage.removeItem(key) } catch { /* The in-session draft stays available. */ }
  }
  return [value, change] as const
}
