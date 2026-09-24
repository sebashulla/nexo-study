import { useEffect, useRef, useState, type PointerEvent } from 'react'
import type { Course, Material, MaterialTopic } from './types'
import type { MaterialStudyMode } from './lib/router'
import { callAI } from './lib/aiClient'
import { contextForQuestion } from './lib/learningContext'
import { signedPdfUrl } from './lib/learningRepository'
import { ResponseRenderer } from './ResponseRenderer'

type Source = { materialId: string; materialTitle: string; pageStart: number; pageEnd: number }
type Turn = { question: string; answer: string; sources: Source[] }

const methods: { mode: MaterialStudyMode; title: string; description: string }[] = [
  { mode: 'learn', title: 'Aprender con Nexo', description: 'Recorre los conceptos con un tutor guiado.' },
  { mode: 'flashcards', title: 'Flashcards', description: 'Recuerda las ideas principales.' },
  { mode: 'multiple-choice', title: 'Opción múltiple', description: 'Practica con explicación y fuente.' },
  { mode: 'written', title: 'Examen escrito', description: 'Redacta y recibe feedback académico.' },
  { mode: 'fill-blanks', title: 'Completar espacios', description: 'Recupera términos sin ver la respuesta.' },
  { mode: 'notes', title: 'Apuntes', description: 'Organiza lo esencial del material.' },
  { mode: 'exam', title: 'Simulacro', description: 'Combina métodos para evaluar lo aprendido.' },
]

function pdfPageUrl(url: string, page: number) {
  return `${url.split('#')[0]}#page=${page}`
}

export function MaterialWorkspace({ course, material, localPdf, initialPage, onBack, onStudy, onRetry }: {
  course: Course
  material: Material
  localPdf?: File
  initialPage?: number
  onBack: () => void
  onStudy: (mode: MaterialStudyMode) => void
  onRetry?: () => void
}) {
  const [pdfUrl, setPdfUrl] = useState('')
  const [pdfError, setPdfError] = useState('')
  const [page, setPage] = useState(1)
  const [panelOpen, setPanelOpen] = useState(true)
  const [panelTab, setPanelTab] = useState<'chat' | 'content'>('content')
  const [mobileTab, setMobileTab] = useState<'material' | 'nexo'>('material')
  const [nexoPercent, setNexoPercent] = useState(() => {
    try { return Number(localStorage.getItem('nexo-material-split-v1')) || 40 } catch { return 40 }
  })
  const [question, setQuestion] = useState('')
  const [turns, setTurns] = useState<Turn[]>([])
  const [busy, setBusy] = useState(false)
  const [chatError, setChatError] = useState('')
  const splitRef = useRef<HTMLDivElement>(null)
  const shellRef = useRef<HTMLElement>(null)
  const ready = material.processingStatus === 'ready' || (!material.processingStatus && Boolean(material.text))
  const summaryPayload = material.artifacts?.find(artifact => artifact.type === 'summary' && artifact.status === 'ready')?.payload
  const summary = summaryPayload && typeof summaryPayload === 'object' && !Array.isArray(summaryPayload) && 'summary' in summaryPayload && typeof summaryPayload.summary === 'string'
    ? summaryPayload.summary : ''

  useEffect(() => {
    if (initialPage && initialPage > 0) setPage(initialPage)
  }, [initialPage])

  useEffect(() => {
    if (localPdf) {
      const objectUrl = URL.createObjectURL(localPdf)
      setPdfUrl(objectUrl)
      setPdfError('')
      return () => URL.revokeObjectURL(objectUrl)
    }
    if (!material.storagePath) { setPdfUrl(''); return }
    let live = true
    void signedPdfUrl(material.storagePath).then(url => {
      if (live) { setPdfUrl(url); setPdfError('') }
    }).catch(() => { if (live) setPdfError('No pudimos abrir el PDF guardado. Puedes seguir leyendo el texto extraído.') })
    return () => { live = false }
  }, [localPdf, material.storagePath])

  useEffect(() => {
    try { localStorage.setItem('nexo-material-split-v1', String(nexoPercent)) } catch { /* Keep the current split. */ }
  }, [nexoPercent])

  const send = async () => {
    const q = question.trim()
    if (!q || busy || !ready) return
    const selected = contextForQuestion(q, [material])
    setBusy(true); setChatError('')
    try {
      const answer = await callAI({ task: 'solve', question: q, category: course.name,
        courseId: course.id, materialId: material.id,
        context: `Material: ${material.title}. Usa solo estos fragmentos como fuente. Si no contienen la respuesta, dilo. Cita título y página cuando corresponda.\n\n${selected.context}` })
      setTurns(current => [...current, { question: q, answer, sources: selected.sources }])
      setQuestion('')
    } catch { setChatError('Nexo no pudo responder ahora. Tu pregunta sigue aquí para que puedas reintentar.') }
    finally { setBusy(false) }
  }

  const selectPage = (target: number) => {
    setPage(target)
    setMobileTab('material')
  }

  const startResize = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const resize = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId) || !splitRef.current) return
    const bounds = splitRef.current.getBoundingClientRect()
    const next = Math.round((bounds.right - event.clientX) / bounds.width * 100)
    setNexoPercent(Math.min(60, Math.max(30, next)))
  }

  const topicButton = (topic: MaterialTopic) => <button key={topic.id} className="material-topic" onClick={() => selectPage(topic.pageStart ?? 1)}>
    <span>{topic.pageStart ? `Pág. ${topic.pageStart}${topic.pageEnd && topic.pageEnd !== topic.pageStart ? `–${topic.pageEnd}` : ''}` : 'Tema'}</span>
    <strong>{topic.title}</strong>
    <small>{topic.summary}</small>
  </button>

  return <section className="material-workspace" ref={shellRef}>
    <header className="material-workspace-head">
      <div><button className="text-button" onClick={onBack}>← {course.name}</button><h2>{material.title}</h2><p>{material.sourceName || 'Material de estudio'} · {material.pageCount || material.pages?.length || 1} {material.pageCount === 1 ? 'página' : 'páginas'}</p></div>
      <div className="material-workspace-head-actions"><span className="source-badge">{material.processingStatus === 'failed' ? 'Preparación pendiente' : ready ? 'Nexo listo' : 'Nexo preparando'}</span><div className="material-split-presets" role="group" aria-label="Proporción entre documento y Nexo">{([30, 50, 60] as const).map(percent => <button key={percent} className={`secondary ${panelOpen && nexoPercent === percent ? 'active' : ''}`} aria-pressed={panelOpen && nexoPercent === percent} onClick={() => { setNexoPercent(percent); setPanelOpen(true) }}>{100 - percent}/{percent}</button>)}</div><button className="secondary" onClick={() => { if (shellRef.current && document.fullscreenElement !== shellRef.current) void shellRef.current.requestFullscreen?.(); else if (document.fullscreenElement) void document.exitFullscreen?.() }}>Pantalla completa</button><button className="secondary panel-toggle" onClick={() => setPanelOpen(value => !value)}>{panelOpen ? 'Ocultar Nexo' : 'Abrir Nexo'}</button></div>
    </header>
    {!ready && <div className="material-processing" role="status"><strong>{material.processingStatus === 'failed' ? 'No pudimos leer el contenido de este PDF.' : 'Preparando tu material'}</strong><p>El documento sigue disponible mientras Nexo organiza su contenido.</p><ol><li>✓ Documento cargado</li><li>{material.processingStage === 'reading' ? '◉' : material.processingStatus === 'failed' ? '○' : '✓'} Leyendo contenido</li><li>{material.processingStage === 'indexing' ? '◉' : '○'} Identificando conceptos</li><li>○ Organizando temas</li><li>○ Preparando tu espacio</li></ol>{material.processingStatus === 'failed' && onRetry && <button className="secondary" onClick={onRetry}>Reintentar lectura</button>}</div>}
    <div className="material-mobile-tabs" role="tablist" aria-label="Vista del material"><button role="tab" aria-selected={mobileTab === 'material'} onClick={() => setMobileTab('material')}>Material</button><button role="tab" aria-selected={mobileTab === 'nexo'} onClick={() => { setMobileTab('nexo'); setPanelOpen(true) }}>Nexo IA</button></div>
    <div ref={splitRef} className={`material-split ${panelOpen ? '' : 'nexo-hidden'}`} style={panelOpen ? { gridTemplateColumns: `minmax(0, ${100 - nexoPercent}fr) 7px minmax(0, ${nexoPercent}fr)` } : undefined}>
      <div className={`material-document ${mobileTab === 'material' ? 'mobile-active' : ''}`}>
        {material.sourceType === 'pdf' && pdfUrl ? <iframe key={`${pdfUrl}:${page}`} title={`PDF ${material.title}`} src={pdfPageUrl(pdfUrl, page)} /> : <div className="material-text-preview">{pdfError && <p role="status">{pdfError}</p>}{material.pages?.length ? material.pages.map(item => <article id={`material-page-${item.page}`} key={item.page}><small>Página {item.page}</small><p>{item.text}</p></article>) : <article><small>Material</small><p>{material.text}</p></article>}</div>}
      </div>
      {panelOpen && <><div className="material-divider" role="separator" aria-label="Ajustar ancho de Nexo" aria-orientation="vertical" tabIndex={0} onPointerDown={startResize} onPointerMove={resize} onKeyDown={event => { if (event.key === 'ArrowLeft') setNexoPercent(value => Math.min(60, value + 5)); if (event.key === 'ArrowRight') setNexoPercent(value => Math.max(30, value - 5)) }}/><aside className={`material-nexo-panel ${mobileTab === 'nexo' ? 'mobile-active' : ''}`} aria-label="Nexo IA del material">
        <div className="material-nexo-head"><strong>Nexo IA</strong><div><button className={panelTab === 'chat' ? 'active' : ''} onClick={() => setPanelTab('chat')}>Chat</button><button className={panelTab === 'content' ? 'active' : ''} onClick={() => setPanelTab('content')}>Contenido</button></div></div>
        {panelTab === 'content' ? <div className="material-nexo-content"><h3>¿Qué quieres hacer con este material?</h3><p>Elige un método cuando estés listo. Nexo conserva el contexto de este documento.</p>{summary && <div className="material-minimum-summary"><strong>Vista rápida del material</strong><p>{summary}</p></div>}<div className="material-methods">{methods.map(method => <button key={method.mode} disabled={!ready} onClick={() => onStudy(method.mode)}><strong>{method.title}</strong><span>{method.description}{material.artifacts?.some(artifact => artifact.status === 'ready' && (artifact.type === method.mode || (method.mode === 'multiple-choice' && artifact.type === 'multiple_choice') || (method.mode === 'written' && artifact.type === 'written_questions') || (method.mode === 'fill-blanks' && artifact.type === 'fill_blanks'))) ? ' · Listo en tu biblioteca' : ''}</span></button>)}</div><h3>Temas detectados</h3><div className="material-topics">{material.topics?.length ? material.topics.map(topicButton) : <p>Los temas aparecerán cuando Nexo termine de leer el documento.</p>}</div></div> : <div className="material-nexo-chat"><div className="material-chat-turns">{turns.length ? turns.map((turn, index) => <article key={index}><div className="material-chat-question">{turn.question}</div><div className="material-chat-answer"><ResponseRenderer text={turn.answer}/>{turn.sources.length > 0 && <div className="material-chat-sources">{turn.sources.map((source, sourceIndex) => <button key={sourceIndex} onClick={() => selectPage(source.pageStart)}>{source.materialTitle} · página {source.pageStart}</button>)}</div>}</div></article>) : <p>Pregunta sobre este material. Nexo buscará fragmentos relevantes y te mostrará las páginas usadas.</p>}{busy && <p role="status">Nexo está revisando el material…</p>}</div><div className="material-chat-composer">{chatError && <p role="alert">{chatError}</p>}<textarea aria-label="Preguntar sobre este material" value={question} onChange={event => setQuestion(event.target.value)} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); void send() } }} placeholder={ready ? 'Pregunta algo sobre este documento…' : 'Nexo está leyendo el documento…'} disabled={!ready} rows={3}/><button className="primary" disabled={!question.trim() || busy || !ready} onClick={() => void send()}>Preguntar a Nexo</button></div></div>}
      </aside></>}
    </div>
  </section>
}
