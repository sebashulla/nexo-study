import { useEffect, useRef, useState, type PointerEvent } from 'react'
import type { Course, Material, MaterialTopic } from './types'
import type { MaterialStudyMode } from './lib/router'
import { callAI } from './lib/aiClient'
import { contextForQuestion } from './lib/learningContext'
import { searchRemoteContext, signedPdfUrl } from './lib/learningRepository'
import { renderPdfPages } from './lib/documentEngine'
import { displayMaterialTitle } from './lib/materialTitles'
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
const methodGroups: { title: string; modes: MaterialStudyMode[] }[] = [
  { title: 'Aprender', modes: ['learn', 'notes'] },
  { title: 'Practicar', modes: ['flashcards', 'multiple-choice', 'fill-blanks'] },
  { title: 'Evaluar', modes: ['written', 'exam'] },
]

function pdfPageUrl(url: string, page: number) {
  return `${url.split('#')[0]}#page=${page}`
}

export function MaterialWorkspace({ course, material, localPdf, initialPage, onBack, onStudy, onRetry, onAnalyzeMore, onVisualAnalysis }: {
  course: Course
  material: Material
  localPdf?: File
  initialPage?: number
  onBack: () => void
  onStudy: (mode: MaterialStudyMode) => void
  onRetry?: () => void
  onAnalyzeMore?: () => void
  onVisualAnalysis?: (pages: number[], text: string) => void
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
  const [visualBusy, setVisualBusy] = useState(false)
  const [visualError, setVisualError] = useState('')
  const [rangeStart, setRangeStart] = useState(1)
  const [rangeEnd, setRangeEnd] = useState(1)
  const [fullscreen, setFullscreen] = useState(false)
  const splitRef = useRef<HTMLDivElement>(null)
  const shellRef = useRef<HTMLElement>(null)
  const layoutMenuRef = useRef<HTMLDetailsElement>(null)
  const ready = Boolean(material.chunks?.length || material.text.trim())
  const analysisStatus = material.analysisStatus ?? (ready ? 'ready' : 'not_started')
  const analyzing = analysisStatus === 'reading' || analysisStatus === 'indexing'
  const partial = analysisStatus === 'partial'
  const availablePages = material.analyzedPages?.length ?? 0
  const contextPageCount = new Set((material.chunks ?? []).flatMap(chunk =>
    Array.from({ length: chunk.pageEnd - chunk.pageStart + 1 }, (_, index) => chunk.pageStart + index))).size
  const canAnalyzeMore = partial && material.documentKind !== 'scan' && Boolean(material.pageCount && availablePages < material.pageCount)
  const title = displayMaterialTitle(material.title)
  const summaryPayload = material.artifacts?.find(artifact => artifact.type === 'summary' && artifact.status === 'ready')?.payload
  const summary = summaryPayload && typeof summaryPayload === 'object' && !Array.isArray(summaryPayload) && 'summary' in summaryPayload && typeof summaryPayload.summary === 'string'
    ? summaryPayload.summary : ''

  useEffect(() => {
    if (initialPage && initialPage > 0) setPage(initialPage)
  }, [initialPage])

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === shellRef.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

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
    const local = contextForQuestion(q, [material])
    setBusy(true); setChatError('')
    try {
      const remote = await searchRemoteContext(course, q, material.id).catch(() => local)
      const selected = remote.context ? remote : local
      if (!selected.context) { setChatError('Nexo todavía no tiene páginas preparadas para responder.'); return }
      const answer = await callAI({ task: 'solve', question: q, category: course.name,
        courseId: course.id, materialId: material.id,
        context: `Material: ${material.title}. Usa solo estos fragmentos como fuente. Si no contienen la respuesta, dilo. Cita título y página cuando corresponda.\n\n${selected.context}` })
      setTurns(current => [...current, { question: q, answer, sources: selected.sources }])
      setQuestion('')
    } catch { setChatError('Nexo no pudo responder ahora. Tu pregunta sigue aquí para que puedas reintentar.') }
    finally { setBusy(false) }
  }

  const analyzeVisual = async () => {
    const first = Math.min(rangeStart, rangeEnd)
    const last = Math.max(rangeStart, rangeEnd)
    if (!Number.isInteger(first) || !Number.isInteger(last) || first < 1 || last > (material.pageCount ?? 0) || last - first > 3 || visualBusy) return
    setVisualBusy(true); setVisualError('')
    try {
      let file = localPdf
      if (!file && material.storagePath) {
        const url = await signedPdfUrl(material.storagePath)
        const response = await fetch(url)
        if (!response.ok) throw new Error('No pudimos recuperar el PDF guardado.')
        file = new File([await response.blob()], material.sourceName ?? 'documento.pdf', { type: 'application/pdf' })
      }
      if (!file) throw new Error('Vuelve a subir este PDF para analizar sus páginas visualmente.')
      const selected = Array.from({ length: last - first + 1 }, (_, index) => first + index)
      const images = await renderPdfPages(file, selected)
      const text = await callAI({ task: 'solve', category: course.name, courseId: course.id, materialId: material.id,
        question: `Analiza solo ${selected.length === 1 ? `la página ${first}` : `las páginas ${first}–${last}`} de este material escaneado. Extrae los conceptos académicos visibles y explica lo que se puede afirmar. Si algo no se lee, dilo. No inventes contenido.`, images })
      setTurns(current => [...current, { question: `Análisis visual · ${selected.length === 1 ? `página ${first}` : `páginas ${first}–${last}`}`, answer: text,
        sources: [{ materialId: material.id, materialTitle: material.title, pageStart: first, pageEnd: last }] }])
      onVisualAnalysis?.(selected, text)
      setPanelTab('chat'); setMobileTab('nexo'); setPanelOpen(true)
    } catch (error) {
      setVisualError(error instanceof Error && /^(Vuelve a subir|No pudimos recuperar)/.test(error.message)
        ? error.message : 'Nexo tuvo un problema analizando estas páginas. Puedes reintentar.')
    } finally { setVisualBusy(false) }
  }

  const selectPage = (target: number) => {
    setPage(target)
    setRangeStart(target); setRangeEnd(target)
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
      <div><button className="text-button" onClick={onBack}>← {course.name}</button><h2>{title}</h2><p>{material.sourceName || 'Material de estudio'} · {material.pageCount ? `${material.pageCount} ${material.pageCount === 1 ? 'página' : 'páginas'}` : 'Calculando páginas…'}</p></div>
      <div className="material-workspace-head-actions"><span className="source-badge">{material.documentKind === 'scan' ? 'Documento escaneado' : analyzing ? 'Nexo preparando' : partial ? 'Análisis parcial' : analysisStatus === 'failed' ? 'Análisis pendiente' : ready ? 'Nexo listo' : 'Preparación pendiente'}</span><details className="material-layout-menu" ref={layoutMenuRef}><summary>Layout ▾</summary><div role="group" aria-label="Proporción entre documento y Nexo">{([30, 50, 60] as const).map(percent => <button key={percent} className={`secondary ${panelOpen && nexoPercent === percent ? 'active' : ''}`} aria-pressed={panelOpen && nexoPercent === percent} onClick={() => { setNexoPercent(percent); setPanelOpen(true); if (layoutMenuRef.current) layoutMenuRef.current.open = false }}>{100 - percent}/{percent}</button>)}</div></details><button className="secondary" aria-label={fullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'} onClick={() => { if (shellRef.current && document.fullscreenElement !== shellRef.current) void shellRef.current.requestFullscreen?.(); else if (document.fullscreenElement) void document.exitFullscreen?.() }}>⛶</button><button className="secondary panel-toggle" aria-label={panelOpen ? 'Ocultar Nexo' : 'Abrir Nexo'} onClick={() => setPanelOpen(value => !value)}>Nexo ◧</button></div>
    </header>
    {(analyzing || partial || analysisStatus === 'failed' || material.documentKind === 'scan' || !ready) && <div className="material-processing" role="status"><strong>{material.documentKind === 'scan' ? 'Este documento parece estar escaneado.' : analyzing ? `Nexo preparando · ${material.analysisProgress ? `${material.analysisProgress.completed}/${material.analysisProgress.total} páginas seleccionadas de ${material.pageCount ?? '…'}` : 'leyendo metadatos'}` : partial ? `Nexo ha preparado ${availablePages} de ${material.pageCount ?? '…'} páginas` : analysisStatus === 'failed' ? 'No pudimos preparar el análisis.' : 'Preparando tu material'}</strong><ol><li>✓ Documento</li><li>{analyzing && material.processingStage === 'reading' ? '●' : availablePages ? '✓' : '○'} Texto</li><li>{analyzing && material.processingStage === 'indexing' ? '●' : material.topics?.length ? '✓' : '○'} Indexando</li><li>{material.topics?.length ? '✓' : '○'} Temas</li></ol>{(analysisStatus === 'failed' || analysisStatus === 'not_started') && onRetry && <button className="secondary" onClick={onRetry}>Reintentar lectura</button>}{canAnalyzeMore && onAnalyzeMore && <button className="secondary" onClick={onAnalyzeMore}>Analizar más páginas</button>}{material.documentKind === 'scan' && <button className="secondary" onClick={() => { setPanelTab('content'); setMobileTab('nexo'); setPanelOpen(true) }}>Analizar visualmente</button>}</div>}
    <div className="material-mobile-tabs" role="tablist" aria-label="Vista del material"><button role="tab" aria-selected={mobileTab === 'material'} onClick={() => setMobileTab('material')}>Material</button><button role="tab" aria-selected={mobileTab === 'nexo'} onClick={() => { setMobileTab('nexo'); setPanelOpen(true) }}>Nexo IA</button></div>
    <div ref={splitRef} className={`material-split ${panelOpen ? '' : 'nexo-hidden'}`} style={panelOpen ? { gridTemplateColumns: `minmax(0, ${100 - nexoPercent}fr) 7px minmax(0, ${nexoPercent}fr)` } : undefined}>
      <div className={`material-document ${mobileTab === 'material' ? 'mobile-active' : ''}`}>
        {material.sourceType === 'pdf' && pdfUrl ? <iframe key={`${pdfUrl}:${page}`} title={`PDF ${material.title}`} src={pdfPageUrl(pdfUrl, page)} /> : <div className="material-text-preview">{pdfError && <p role="status">{pdfError}</p>}{material.pages?.length ? material.pages.map(item => <article id={`material-page-${item.page}`} key={item.page}><small>Página {item.page}</small><p>{item.text}</p></article>) : <article><small>Material</small><p>{material.text}</p></article>}</div>}
      </div>
      {panelOpen && <><div className="material-divider" role="separator" aria-label="Ajustar ancho de Nexo" aria-orientation="vertical" tabIndex={0} onPointerDown={startResize} onPointerMove={resize} onKeyDown={event => { if (event.key === 'ArrowLeft') setNexoPercent(value => Math.min(60, value + 5)); if (event.key === 'ArrowRight') setNexoPercent(value => Math.max(30, value - 5)) }}/><aside className={`material-nexo-panel ${mobileTab === 'nexo' ? 'mobile-active' : ''}`} aria-label="Nexo IA del material">
        <div className="material-nexo-head"><strong>Nexo IA</strong><div><button className={panelTab === 'chat' ? 'active' : ''} onClick={() => setPanelTab('chat')}>Chat</button><button className={panelTab === 'content' ? 'active' : ''} onClick={() => setPanelTab('content')}>Contenido</button></div></div>
        {panelTab === 'content' ? <div className="material-nexo-content">
          <h3>¿Qué quieres hacer con este material?</h3>
          <p>Nexo conserva el contexto de este documento y prepara cada método cuando lo necesites.</p>
          {!ready && <p role="status">{material.documentKind === 'scan' ? 'Analiza algunas páginas para habilitar los métodos de estudio.' : 'Disponible cuando Nexo termine de analizar este material.'}</p>}
          {summary && <div className="material-minimum-summary"><strong>Vista rápida del material</strong><p>{summary}</p></div>}
          {(material.documentKind === 'scan' || material.documentKind === 'mixed') && material.pageCount && <div className="material-visual-analysis">
            <strong>Analizar visualmente con Nexo</strong><p>Elige la página actual o un rango de hasta cuatro páginas. Solo se enviarán esas imágenes.</p>
            <div><label>Desde <input aria-label="Primera página visual" type="number" min={1} max={material.pageCount} value={rangeStart} onChange={event => setRangeStart(Number(event.target.value))}/></label><label>Hasta <input aria-label="Última página visual" type="number" min={1} max={material.pageCount} value={rangeEnd} onChange={event => setRangeEnd(Number(event.target.value))}/></label></div>
            <button className="secondary" disabled={visualBusy || Math.abs(rangeEnd - rangeStart) > 3 || Math.min(rangeStart, rangeEnd) < 1 || Math.max(rangeStart, rangeEnd) > material.pageCount} onClick={() => void analyzeVisual()}>{visualBusy ? 'Analizando páginas…' : 'Analizar visualmente'}</button>{visualError && <p role="alert">{visualError}</p>}
          </div>}
          {methodGroups.map(group => <div className="material-method-group" key={group.title}><h4>{group.title}</h4><div className="material-methods">{methods.filter(method => group.modes.includes(method.mode)).map(method => <button key={method.mode} disabled={!ready} onClick={() => onStudy(method.mode)}><strong>{method.title}</strong><span>{method.description}{material.artifacts?.some(artifact => artifact.status === 'ready' && (artifact.type === method.mode || (method.mode === 'multiple-choice' && artifact.type === 'multiple_choice') || (method.mode === 'written' && artifact.type === 'written_questions') || (method.mode === 'fill-blanks' && artifact.type === 'fill_blanks'))) ? ' · Listo en tu biblioteca' : ''}</span></button>)}</div></div>)}
          <h3>Temas detectados</h3><div className="material-topics">{material.topics?.length ? material.topics.map(topicButton) : <p>Los temas aparecerán cuando Nexo termine de leer el documento.</p>}</div>
        </div> : <div className="material-nexo-chat"><div className="material-chat-turns">{partial && ready && <p role="status">Nexo responderá usando {contextPageCount} {contextPageCount === 1 ? 'página preparada' : 'páginas preparadas'}.</p>}{turns.length ? turns.map((turn, index) => <article key={index}><div className="material-chat-question">{turn.question}</div><div className="material-chat-answer"><ResponseRenderer text={turn.answer}/>{turn.sources.length > 0 && <div className="material-chat-sources">{turn.sources.map((source, sourceIndex) => <button key={sourceIndex} onClick={() => selectPage(source.pageStart)}>{source.materialTitle} · página {source.pageStart}</button>)}</div>}</div></article>) : <p>{ready ? 'Pregunta sobre este material. Nexo buscará fragmentos relevantes y te mostrará las páginas usadas.' : 'Analiza páginas de este documento para comenzar a preguntar a Nexo.'}</p>}{busy && <p role="status">Nexo está revisando el material…</p>}</div><div className="material-chat-composer">{chatError && <p role="alert">{chatError}</p>}<textarea aria-label="Preguntar sobre este material" value={question} onChange={event => setQuestion(event.target.value)} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); void send() } }} placeholder={ready ? 'Pregunta algo sobre este documento…' : 'Prepara algunas páginas para conversar con Nexo…'} disabled={!ready} rows={3}/><button className="primary" disabled={!question.trim() || busy || !ready} onClick={() => void send()}>Preguntar a Nexo</button></div></div>}
      </aside></>}
    </div>
  </section>
}
