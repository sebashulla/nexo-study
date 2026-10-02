import { useState } from 'react'
import { useAuth } from './auth/AuthContext'
import { supabase } from './lib/supabase'
import { Dialog } from './Dialog'
import { Icon } from './Icon'

type FeedbackType = 'idea' | 'bug' | 'experience' | 'other'

const types: { value: FeedbackType; icon: string; label: string }[] = [
  { value: 'idea', icon: 'idea', label: 'Sugerencia' },
  { value: 'bug', icon: 'bug', label: 'Problema' },
  { value: 'experience', icon: '✦', label: 'Experiencia' },
  { value: 'other', icon: 'chat', label: 'Otro' },
]

export function FeedbackDialog({ context, onClose }: { context: string; onClose: () => void }) {
  const { user } = useAuth()
  const [includeContext, setIncludeContext] = useState(false)
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
    onClose()
    reset()
  }

  const submit = async () => {
    if (!supabase || !user || message.trim().length < 5) return
    setBusy(true); setError('')
    try {
    const { error: insertError } = await supabase.from('feedback_entries').insert({
      user_id: user.id,
      feedback_type: kind,
      rating,
      message: message.trim(),
      page_context: includeContext ? context : null,
      user_agent: includeContext ? navigator.userAgent.slice(0, 500) : null,
    })
    if (insertError) {
      setError(insertError.message.includes('feedback_entries')
        ? 'No pudimos guardar tu comentario. Inténtalo más tarde.'
        : insertError.message)
      return
    }
    setSent(true)
    } catch { setError('No pudimos enviar tu comentario. Revisa tu conexión y vuelve a intentarlo.') }
    finally { setBusy(false) }
  }

  return <Dialog title="¿Qué podríamos mejorar?" className="feedback-modal" onClose={close}>
        <button className="feedback-close" onClick={close} aria-label="Cerrar">×</button>
        {!sent ? <>
          <div className="feedback-heading"><div><h2>¿Qué podríamos mejorar?</h2><p>Cuéntanos qué te gustó, qué falló o qué te gustaría encontrar aquí.</p></div></div>
          <div className="feedback-type-grid">{types.map(item => <button key={item.value} className={kind === item.value ? 'active' : ''} onClick={() => setKind(item.value)}><span><Icon name={item.icon}/></span>{item.label}</button>)}</div>
          <div className="feedback-rating"><span>¿Cómo fue tu experiencia?</span><div>{[1,2,3,4,5].map(value => <button key={value} aria-label={`${value} ${value === 1 ? 'estrella' : 'estrellas'}`} aria-pressed={value === rating} className={value <= rating ? 'active' : ''} onClick={() => setRating(value)}>★</button>)}</div></div>
          <label className="feedback-message">Tu comentario<textarea autoFocus rows={4} maxLength={4000} value={message} onChange={event => setMessage(event.target.value)} placeholder="Describe el problema o tu sugerencia…" /><small>{message.length}/4000</small></label>
          <label className="utility-check"><input type="checkbox" checked={includeContext} onChange={event => setIncludeContext(event.target.checked)}/> Incluir información técnica de esta pantalla</label>
          {error && <div role="alert" className="auth-alert error">{error}</div>}
          <button className="primary feedback-send" disabled={busy || message.trim().length < 5} onClick={submit}>{busy ? 'Enviando…' : 'Enviar comentario →'}</button>
          <p className="feedback-privacy">Tu comentario queda asociado a tu cuenta para poder entender mejor el contexto de la beta.</p>
        </> : <div className="feedback-success"><div>✓</div><h2>¡Gracias!</h2><p>Tu comentario ya quedó guardado. Esto nos ayuda a decidir qué mejorar primero.</p><button className="primary" onClick={close}>Volver a Nexo</button></div>}
    </Dialog>
}
