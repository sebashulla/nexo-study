import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from './auth/AuthContext'
import { callAI } from './lib/aiClient'
import { imageLimits, prepareImages, type ImageAttachment } from './lib/imageUtils'
import { supabase } from './lib/supabase'
import { ResponseRenderer } from './ResponseRenderer'

type HistoryItem = {
  id?: string
  question: string
  category: string
  answer: string
  createdAt: string
  deep: boolean
  imageCount: number
}

const HISTORY_PREFIX = 'nexo-study-resolver-history-v4:'
const LEGACY_HISTORY_PREFIX = 'nexo-study-resolver-history-v3:'

function historyKey(userId: string, workspaceId: string) { return `${HISTORY_PREFIX}${userId}:${workspaceId}` }

function loadLocalHistory(userId: string, workspaceId: string): HistoryItem[] {
  try {
    const saved = localStorage.getItem(historyKey(userId, workspaceId))
      ?? (workspaceId === 'general' ? localStorage.getItem(`${LEGACY_HISTORY_PREFIX}${userId}`) : null)
    const parsed: unknown = JSON.parse(saved || '[]')
    return Array.isArray(parsed) ? parsed : []
  }
  catch { return [] }
}

const suggestions: Record<string, string[]> = {
  General: ['Explícame esto como para un examen', 'Resume la idea central', '¿Cuál sería la respuesta correcta y por qué?'],
  Matemáticas: ['Resuelve paso a paso y comprueba el resultado', '¿Qué fórmula debo usar aquí?', 'Muéstrame el método más corto'],
  Biología: ['Identifica la estructura y explica su función', '¿Qué hallazgos importantes aparecen?', 'Compáralo con la alternativa más parecida'],
  Química: ['Balancea y explica el procedimiento', 'Identifica el concepto químico clave', 'Resuelve mostrando unidades y fórmula'],
  Historia: ['Ubica el hecho en su contexto histórico', 'Explica causas y consecuencias', '¿Qué dato distingue esta alternativa?'],
}

export function ResolverPage({ workspaceId }: { workspaceId: string }) {
  const { user } = useAuth()
  const inputRef = useRef<HTMLInputElement>(null)
  const [category, setCategory] = useState('General')
  const [deep, setDeep] = useState(false)
  const [question, setQuestion] = useState('')
  const [images, setImages] = useState<ImageAttachment[]>([])
  const [dragging, setDragging] = useState(false)
  const [answer, setAnswer] = useState('')
  const [lastQuestion, setLastQuestion] = useState('')
  const [lastImageCount, setLastImageCount] = useState(0)
  const [followUp, setFollowUp] = useState('')
  const [busy, setBusy] = useState(false)
  const [imageBusy, setImageBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [history, setHistory] = useState<HistoryItem[]>(() => user ? loadLocalHistory(user.id, workspaceId) : [])
  const categories = ['General', 'Matemáticas', 'Biología', 'Química', 'Historia']
  const currentSuggestions = useMemo(() => suggestions[category] || suggestions.General, [category])

  useEffect(() => {
    if (!user) return
    try { localStorage.setItem(historyKey(user.id, workspaceId), JSON.stringify(history.slice(0, 25))) }
    catch { /* The answer stays available in this session. */ }
  }, [history, user, workspaceId])

  const importImages = async (files: File[]) => {
    if (!files.length) return
    setImageBusy(true)
    setError('')
    try {
      setImages(await prepareImages(files, images))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron preparar las imágenes.')
    } finally {
      setImageBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const solve = async (override?: { question: string; context?: string; keepImages?: boolean }) => {
    const prompt = (override?.question ?? question).trim()
    const activeImages = override?.keepImages === false ? [] : images
    if (!prompt && activeImages.length === 0) return setError('Escribe una pregunta o adjunta al menos una imagen.')
    setBusy(true)
    setError('')
    setCopied(false)
    if (!override?.context) setAnswer('')

    try {
      const text = await callAI({
        task: 'solve',
        question: prompt || 'Resuelve los ejercicios o analiza el caso mostrado en las imágenes.',
        category,
        mode: deep ? 'deep' : 'standard',
        deep,
        context: override?.context,
        images: activeImages,
      })

      const historyItem: HistoryItem = {
        question: prompt || `${activeImages.length} imagen${activeImages.length === 1 ? '' : 'es'}`,
        category,
        answer: text,
        createdAt: new Date().toISOString(),
        deep,
        imageCount: activeImages.length,
      }

      setAnswer(text)
      setLastQuestion(historyItem.question)
      setLastImageCount(activeImages.length)
      setHistory(prev => [historyItem, ...prev].slice(0, 25))

      if (user && supabase) {
        const { data } = await supabase.from('ai_queries').insert({
          user_id: user.id,
          task: 'solve',
          category,
          question: historyItem.question,
          answer: text,
          deep,
          image_count: activeImages.length,
        }).select('id').single()
        if (data?.id) setHistory(prev => prev.map((item, index) => index === 0 ? { ...item, id: data.id } : item))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nexo IA no está disponible en este momento.')
    } finally {
      setBusy(false)
    }
  }

  const askFollowUp = async () => {
    const q = followUp.trim()
    if (!q || !answer) return
    const context = `Pregunta anterior: ${lastQuestion}\nRespuesta anterior de Nexo: ${answer}`
    setFollowUp('')
    await solve({ question: q, context, keepImages: false })
  }

  const copyAnswer = async () => {
    try {
      await navigator.clipboard.writeText(answer)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {}
  }

  const clearHistory = async () => {
    const ids = history.map(item => item.id).filter((id): id is string => Boolean(id))
    setHistory([])
    if (user && workspaceId === 'general') localStorage.removeItem(`${LEGACY_HISTORY_PREFIX}${user.id}`)
    if (user && supabase && ids.length) await supabase.from('ai_queries').delete().eq('user_id', user.id).in('id', ids)
  }

  return <section className="resolver-shell">
    <div className="resolver-hero"><span className="resolver-kicker">Nexo IA · Resolver</span><h2>¿Qué quieres resolver?</h2><p>Escribe el ejercicio o adjunta hasta {imageLimits.maxImages} imágenes. Nexo puede relacionarlas como partes del mismo caso, ejercicio o práctica.</p></div>

    <div className="subject-tabs">{categories.map(item => <button key={item} className={`subject-tab ${category === item ? 'active' : ''}`} onClick={() => setCategory(item)}>{item}</button>)}</div>

    <div className="resolver-card">
      <input ref={inputRef} id="resolver-images-react" hidden multiple type="file" accept="image/png,image/jpeg,image/webp" onChange={event => importImages(Array.from(event.target.files || []))}/>
      <div
        className={`resolver-drop ${images.length ? 'has-images' : ''} ${dragging ? 'dragging' : ''}`}
        onDragEnter={event => { event.preventDefault(); setDragging(true) }}
        onDragOver={event => event.preventDefault()}
        onDragLeave={event => { if (event.currentTarget === event.target) setDragging(false) }}
        onDrop={event => { event.preventDefault(); setDragging(false); importImages(Array.from(event.dataTransfer.files).filter(file => file.type.startsWith('image/'))) }}
      >
        {images.length === 0 ? <label className="resolver-empty-drop" htmlFor="resolver-images-react"><span className="drop-icon">＋</span><div><strong>{imageBusy ? 'Preparando imágenes…' : 'Añadir imágenes del ejercicio'}</strong><span>Arrastra, pega o selecciona PNG, JPG o WEBP</span></div></label> : <div className="attachment-grid">
          {images.map((image, index) => <div className="attachment-tile" key={image.id}><img src={image.dataUrl} alt={`Adjunto ${index + 1}`}/><span className="attachment-index">{index + 1}</span><button type="button" onClick={() => setImages(current => current.filter(item => item.id !== image.id))} aria-label={`Quitar ${image.name}`}>×</button><small title={image.name}>{image.name}</small></div>)}
          {images.length < imageLimits.maxImages && <label className="attachment-add" htmlFor="resolver-images-react"><b>＋</b><span>Agregar otra</span></label>}
        </div>}
      </div>

      <div className="resolver-compose">
        <textarea
          rows={4}
          placeholder="Escribe tu pregunta aquí…"
          value={question}
          onChange={event => setQuestion(event.target.value)}
          onPaste={event => {
            const files = Array.from(event.clipboardData.files).filter(file => file.type.startsWith('image/'))
            if (files.length) { event.preventDefault(); importImages(files) }
          }}
          onKeyDown={event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); solve() } }}
        />
        {!question && images.length === 0 && <div className="prompt-suggestions">{currentSuggestions.map(suggestion => <button key={suggestion} onClick={() => setQuestion(suggestion)}>{suggestion}</button>)}</div>}
        <div className="resolver-controls"><label className="deep-toggle"><input type="checkbox" checked={deep} onChange={event => setDeep(event.target.checked)}/><span></span><b>Razonamiento reforzado</b></label><div className="resolver-right"><span className="nexo-engine-pill"><i></i>Nexo IA</span><button className="solve-button" onClick={() => solve()} disabled={busy || imageBusy} aria-label="Resolver">{busy ? <span className="mini-spinner"/> : '↑'}</button></div></div>
      </div>
      {images.length > 0 && <div className="attachment-summary"><span>{images.length}/{imageLimits.maxImages} imágenes</span><span>Se comprimen automáticamente antes de enviarse</span></div>}
      {error && <div className="resolver-error">{error}</div>}
    </div>

    {busy && !answer && <div className="thinking-card"><span className="thinking-orb">✦</span><div><strong>Nexo está analizando…</strong><p>{deep ? 'Usando razonamiento reforzado para revisar mejor el problema.' : images.length > 1 ? `Relacionando la información de ${images.length} imágenes.` : 'Identificando datos, conceptos y la forma más útil de responder.'}</p></div></div>}

    {answer && <article className="answer-card enhanced-answer">
      <div className="answer-head"><div><span>✦</span><strong>Respuesta de Nexo</strong><em>Nexo IA</em></div><div className="answer-actions"><button onClick={copyAnswer}>{copied ? '✓ Copiado' : 'Copiar'}</button><button onClick={() => solve({ question: lastQuestion, keepImages: true })} disabled={busy || (lastImageCount > 0 && images.length === 0)} title={lastImageCount > 0 && images.length === 0 ? 'Las imágenes originales no se guardan en el historial' : undefined}>Reintentar</button></div></div>
      <div className="answer-text"><ResponseRenderer text={answer}/></div>
      <div className="follow-up-box"><span>↳</span><textarea rows={2} value={followUp} onChange={event => setFollowUp(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); askFollowUp() } }} placeholder="Pregunta algo sobre esta respuesta…"/><button onClick={askFollowUp} disabled={!followUp.trim() || busy}>Enviar</button></div>
    </article>}

    {history.length > 0 && <section className="resolver-history"><div className="section-head"><div><p className="eyebrow">Tu cuenta</p><h3>Consultas recientes</h3></div><button className="text-button" onClick={clearHistory}>Limpiar</button></div><div className="history-grid">{history.slice(0, 6).map((item, index) => <button key={item.id || `${item.createdAt}-${index}`} className="history-item" onClick={() => { setAnswer(item.answer); setLastQuestion(item.question); setLastImageCount(item.imageCount); setImages([]); setQuestion(item.question); setCategory(item.category); setDeep(Boolean(item.deep)); window.scrollTo({ top: 0, behavior: 'smooth' }) }}><span>{item.category}{item.imageCount ? ` · ${item.imageCount} img` : ''}</span><strong>{item.question}</strong><small>{new Date(item.createdAt).toLocaleString('es-PE')}</small></button>)}</div></section>}
  </section>
}
