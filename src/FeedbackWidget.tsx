import { useState } from 'react'
import { useAuth } from './auth/AuthContext'
import { supabase } from './lib/supabase'

type FeedbackType = 'idea' | 'bug' | 'experience' | 'other'

const types: { value: FeedbackType; icon: string; label: string }[] = [
  { value: 'idea', icon: '💡', label: 'Idea' },
  { value: 'bug', icon: '🛠️', label: 'Algo falló' },
  { value: 'experience', icon: '✨', label: 'Experiencia' },
  { value: 'other', icon: '💬', label: 'Otro' },
]

export function FeedbackWidget({ context }: { context: string }) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<FeedbackType>('idea')
  const [rating, setRating] = useState(5)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  const reset = () => {
    setKind('idea'); setRating(5); setMessage(''); setError(''); setSent(false)
  }

  const close = () => {
    setOpen(false)
    window.setTimeout(reset, 180)
  }

  const submit = async () => {
    if (!supabase || !user || message.trim().length < 5) return
    setBusy(true); setError('')
    const { error: insertError } = await supabase.from('feedback_entries').insert({
      user_id: user.id,
      feedback_type: kind,
      rating,
      message: message.trim(),
      page_context: context,
      user_agent: navigator.userAgent.slice(0, 500),
    })
    setBusy(false)
    if (insertError) {
      setError(insertError.message.includes('feedback_entries')
        ? 'No se pudo enviar. Verifica que ejecutaste la migración SQL 005.'
        : insertError.message)
      return
    }
    setSent(true)
  }

  return <>
    <button className="feedback-fab" onClick={() => setOpen(true)} aria-label="Enviar retroalimentación"><span>💬</span><b>Feedback</b></button>
    {open && <div className="feedback-backdrop" onMouseDown={close}>
      <section className="feedback-modal" onMouseDown={event => event.stopPropagation()}>
        <button className="feedback-close" onClick={close} aria-label="Cerrar">×</button>
        {!sent ? <>
          <div className="feedback-heading"><span className="feedback-spark">✦</span><div><p className="eyebrow">Nexo Study · Beta</p><h2>Ayúdanos a mejorar Nexo</h2><p>Cuéntanos qué te gustó, qué falló o qué te gustaría encontrar aquí.</p></div></div>
          <div className="feedback-type-grid">{types.map(item => <button key={item.value} className={kind === item.value ? 'active' : ''} onClick={() => setKind(item.value)}><span>{item.icon}</span>{item.label}</button>)}</div>
          <div className="feedback-rating"><span>¿Cómo fue tu experiencia?</span><div>{[1,2,3,4,5].map(value => <button key={value} className={value <= rating ? 'active' : ''} onClick={() => setRating(value)}>★</button>)}</div></div>
          <label className="feedback-message">Tu comentario<textarea autoFocus rows={6} maxLength={4000} value={message} onChange={event => setMessage(event.target.value)} placeholder="Ej. Me gustaría poder convertir una clase completa en preguntas de examen…" /><small>{message.length}/4000</small></label>
          {error && <div className="auth-alert error">{error}</div>}
          <button className="primary feedback-send" disabled={busy || message.trim().length < 5} onClick={submit}>{busy ? 'Enviando…' : 'Enviar comentario →'}</button>
          <p className="feedback-privacy">Tu comentario queda asociado a tu cuenta para poder entender mejor el contexto de la beta.</p>
        </> : <div className="feedback-success"><div>✓</div><h2>¡Gracias!</h2><p>Tu comentario ya quedó guardado. Esto nos ayuda a decidir qué mejorar primero.</p><button className="primary" onClick={close}>Volver a Nexo</button></div>}
      </section>
    </div>}
  </>
}
