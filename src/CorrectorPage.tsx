import { useState } from 'react'
import { callAI } from './lib/aiClient'
import { ResponseRenderer } from './ResponseRenderer'

export function CorrectorPage() {
  const [type, setType] = useState('Informe universitario')
  const [text, setText] = useState('')
  const [result, setResult] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const review = async () => {
    if (!text.trim()) return
    setBusy(true); setError(''); setResult('')
    try { setResult(await callAI({ task: 'review', question: text.trim(), category: type, mode: 'standard', deep: false })) }
    catch (e) { setError(e instanceof Error ? e.message : 'Nexo IA no pudo revisar el trabajo.') }
    finally { setBusy(false) }
  }
  const copy = async () => { try { await navigator.clipboard.writeText(result); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch {} }
  return <section className="corrector-shell"><div className="panel corrector-panel"><span className="resolver-kicker">Nexo IA · Corrector</span><h2>Revisa un trabajo antes de entregarlo</h2><p className="muted-copy">Analiza claridad, estructura, argumentos y redacción. Nexo no inventará bibliografía: cuando una afirmación necesite evidencia, la marcará.</p><label className="corrector-label">Tipo de trabajo<select value={type} onChange={e => setType(e.target.value)}><option>Informe universitario</option><option>Ensayo</option><option>Respuesta de examen</option><option>Introducción / conclusión</option></select></label><textarea className="review-text" rows={14} value={text} onChange={e => setText(e.target.value)} placeholder="Pega aquí el trabajo…"/><div className="review-actions"><span>{text.trim().split(/\s+/).filter(Boolean).length} palabras · revisión con Nexo IA</span><button className="primary" onClick={review} disabled={busy || !text.trim()}>{busy ? 'Revisando…' : 'Revisar con Nexo'}</button></div>{error && <div className="resolver-error">{error}</div>}{busy && <div className="review-loading">✦ Analizando estructura, claridad y puntos a corregir…</div>}{result && <article className="answer-card review-answer enhanced-answer"><div className="answer-head"><div><span>✎</span><strong>Revisión</strong><em>Nexo IA</em></div><div className="answer-actions"><button onClick={copy}>{copied ? '✓ Copiado' : 'Copiar'}</button></div></div><div className="answer-text"><ResponseRenderer text={result}/></div></article>}</div></section>
}
