import { useEffect, useMemo, useState } from 'react'
import { useAuth } from './auth/AuthContext'
import { BrandLogo } from './BrandLogo'
import { supabase } from './lib/supabase'

type FeedbackEntry = {
  id: string
  user_id: string
  feedback_type: 'idea' | 'bug' | 'experience' | 'other'
  rating: number | null
  message: string
  page_context: string | null
  status: 'new' | 'reviewing' | 'done'
  created_at: string
}

const typeLabels: Record<FeedbackEntry['feedback_type'], string> = {
  idea: '💡 Idea', bug: '🛠️ Error', experience: '✨ Experiencia', other: '💬 Otro',
}

export function AdminFeedbackPage() {
  const { user, signOut } = useAuth()
  const [checking, setChecking] = useState(true)
  const [allowed, setAllowed] = useState(false)
  const [items, setItems] = useState<FeedbackEntry[]>([])
  const [authors, setAuthors] = useState<Record<string, { username: string | null; full_name: string | null }>>({})
  const [filter, setFilter] = useState<'all' | FeedbackEntry['status']>('all')
  const [error, setError] = useState('')

  useEffect(() => {
    const client = supabase
    if (!client || !user) return
    let cancelled = false
    const run = async () => {
      const { data: profile, error: profileError } = await client.from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
      if (cancelled) return
      if (profileError || !profile?.is_admin) { setChecking(false); setAllowed(false); return }
      setAllowed(true)
      const { data, error: feedbackError } = await client.from('feedback_entries').select('id,user_id,feedback_type,rating,message,page_context,status,created_at').order('created_at', { ascending: false }).limit(250)
      if (cancelled) return
      if (feedbackError) setError(feedbackError.message)
      else {
        const feedback = (data || []) as FeedbackEntry[]
        setItems(feedback)
        const ids = Array.from(new Set(feedback.map(item => item.user_id)))
        if (ids.length) {
          const { data: profiles } = await client.from('profiles').select('id,username,full_name').in('id', ids)
          if (!cancelled && profiles) setAuthors(Object.fromEntries(profiles.map(profile => [profile.id, { username: profile.username, full_name: profile.full_name }])))
        }
      }
      setChecking(false)
    }
    run()
    return () => { cancelled = true }
  }, [user])

  const visible = useMemo(() => filter === 'all' ? items : items.filter(item => item.status === filter), [items, filter])

  const updateStatus = async (id: string, status: FeedbackEntry['status']) => {
    const client = supabase
    if (!client) return
    const { error: updateError } = await client.from('feedback_entries').update({ status }).eq('id', id)
    if (updateError) return setError(updateError.message)
    setItems(current => current.map(item => item.id === id ? { ...item, status } : item))
  }

  if (checking) return <main className="admin-gate"><BrandLogo/><div className="admin-loader"/><p>Comprobando acceso…</p></main>
  if (!allowed) return <main className="admin-gate"><BrandLogo/><span className="admin-404">404</span><h1>Página no encontrada</h1><p>La dirección solicitada no está disponible.</p><button className="secondary" onClick={() => { window.location.href = '/' }}>Volver a Nexo</button></main>

  return <main className="admin-shell">
    <header className="admin-topbar"><BrandLogo compact/><div><span className="admin-badge">ADMIN</span><button className="secondary" onClick={() => { window.location.href = '/' }}>Abrir Nexo</button><button className="secondary" onClick={() => signOut()}>Salir</button></div></header>
    <section className="admin-hero"><div><p className="eyebrow">Beta insights</p><h1>Comentarios de Nexo</h1><p>Retroalimentación privada enviada por los usuarios de la beta.</p></div><div className="admin-metric"><strong>{items.length}</strong><span>comentarios</span></div></section>
    {error && <div className="auth-alert error">{error}</div>}
    <div className="admin-filters">{(['all','new','reviewing','done'] as const).map(value => <button key={value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{value === 'all' ? 'Todos' : value === 'new' ? 'Nuevos' : value === 'reviewing' ? 'Revisando' : 'Listos'}</button>)}</div>
    <section className="admin-feedback-grid">{visible.length ? visible.map(item => <article key={item.id} className="admin-feedback-card">
      <div className="admin-feedback-meta"><span>{typeLabels[item.feedback_type]}</span><span>{'★'.repeat(item.rating || 0)}{'☆'.repeat(Math.max(0,5-(item.rating || 0)))}</span></div>
      <p>{item.message}</p>
      <div className="admin-feedback-context"><span>{item.page_context || 'Sin contexto'}</span><time>{new Date(item.created_at).toLocaleString('es-PE')}</time></div>
      <div className="admin-feedback-actions"><select value={item.status} onChange={event => updateStatus(item.id, event.target.value as FeedbackEntry['status'])}><option value="new">Nuevo</option><option value="reviewing">Revisando</option><option value="done">Listo</option></select><code>{authors[item.user_id]?.username ? `@${authors[item.user_id].username}` : authors[item.user_id]?.full_name || `${item.user_id.slice(0,8)}…`}</code></div>
    </article>) : <div className="admin-empty"><span>✦</span><h3>No hay comentarios aquí</h3><p>Cuando lleguen nuevos mensajes aparecerán en este panel.</p></div>}</section>
  </main>
}
