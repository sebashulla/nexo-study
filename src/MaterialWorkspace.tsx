import { useEffect, useRef, useState, type PointerEvent } from 'react'
import type { Course, Material, MaterialTopic } from './types'
import type { RecallRating } from './lib/learningState'
import type { MaterialStudyMode } from './lib/router'
import { callAI } from './lib/aiClient'
import { contextForQuestion } from './lib/learningContext'
import { loadPageText, searchRemoteContext, signedPdfUrl } from './lib/learningRepository'
import { useAuth } from './auth/AuthContext'
import { PageArtifactView } from './PageArtifactView'
import { analysisPages } from './lib/pageActions'
import { Dialog } from './Dialog'
import { tabKeyboard } from './lib/tabKeyboard'
import { renderPdfPages } from './lib/documentEngine'
import { displayMaterialTitle } from './lib/materialTitles'
import { quickSummaryFor } from './lib/quickSummary'
import { ChatComposer } from './ChatComposer'
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

export function MaterialWorkspace({ course, material, localPdf, initialPage, initialArtifactId, onBack, onStudy, onRetry, onAnalyzeMore, onVisualAnalysis, onPageArtifact, onRecall, onPageAnswer, onPageReveal }: {
  course: Course
  material: Material
  localPdf?: File
  initialPage?: number
  initialArtifactId?: string
  onBack: () => void
  onStudy: (mode: MaterialStudyMode) => void
  onRetry?: () => void
  onAnalyzeMore?: (pages?: number[]) => void
  onVisualAnalysis?: (pages: number[], text: string) => void
  onPageArtifact: (page: number, type: 'summary' | 'flashcards' | 'multiple_choice') => Promise<string>
  onRecall: (label: string, rating: RecallRating) => void
  onPageAnswer: (artifactId: string, label: string, index: number, correct: boolean) => void
  onPageReveal: (artifactId: string, index: number) => void
}) {
  const { user } = useAuth()
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
  const [openContentSection, setOpenContentSection] = useState(() => window.matchMedia('(max-width: 700px)').matches ? 'Practicar' : 'Resumen')
  const [chatPage, setChatPage] = useState<number | null>(null)
  const [pageArtifactId, setPageArtifactId] = useState(initialArtifactId ?? '')
  const [pageBusy, setPageBusy] = useState(false)
  const [pageError, setPageError] = useState('')
  const [moreOpen, setMoreOpen] = useState(false)
  const [moreStart, setMoreStart] = useState(1)
  const [moreEnd, setMoreEnd] = useState(material.pageCount ?? 1)
  const [moreError, setMoreError] = useState('')
  const [rangeStart, setRangeStart] = useState(1)
  const [rangeEnd, setRangeEnd] = useState(1)
  const [fullscreen, setFullscreen] = useState(false)
  const splitRef = useRef<HTMLDivElement>(null)
  const shellRef = useRef<HTMLElement>(null)
  const headRef = useRef<HTMLElement>(null)
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
  const summary = quickSummaryFor(material)
  const pageArtifact = material.artifacts?.find(item => item.id === pageArtifactId && item.status === 'ready')

  useEffect(() => {
    if (initialPage && initialPage > 0) setPage(initialPage)
  }, [initialPage])

  useEffect(() => {
    const media = window.matchMedia('(max-width: 700px)')
    const update = () => setOpenContentSection(media.matches ? 'Practicar' : 'Resumen')
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (!headRef.current) return
    const observer = new ResizeObserver(() => shellRef.current?.style.setProperty('--material-header-height', `${headRef.current?.offsetHeight ?? 0}px`))
    observer.observe(headRef.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => { if (initialArtifactId) { setPageArtifactId(initialArtifactId); setPanelOpen(true); setMobileTab('nexo'); setPanelTab('content') } }, [initialArtifactId])

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
    if (!q || busy || (!ready && !chatPage)) return
    const local = contextForQuestion(q, [material])
    setBusy(true); setChatError('')
    try {
      const pageText = chatPage && user ? await loadPageText(user.id, material, chatPage) : ''
      if (chatPage && !pageText) { setChatError('Esta página no tiene texto preparado. Prepara el rango o analízala visualmente primero.'); return }
      const remote = chatPage ? { context: `[${material.title} · página ${chatPage}]\n${pageText}`, sources: [{ materialId: material.id, materialTitle: material.title, pageStart: chatPage, pageEnd: chatPage }] } : await searchRemoteContext(course, q, material.id).catch(() => local)
      const selected = remote.context ? remote : local
      if (!selected.context) { setChatError('Nexo todavía no tiene páginas preparadas para responder.'); return }
      const answer = await callAI({ task: 'solve', question: q, category: course.name,
        courseId: course.id, materialId: material.id, page: chatPage ?? undefined,
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

  const topicButton = (topic: MaterialTopic) => <details key={topic.id} className="material-topic">
    <summary><strong>{topic.title}</strong><small>{topic.pageStart ? `Pág. ${topic.pageStart}${topic.pageEnd && topic.pageEnd !== topic.pageStart ? `–${topic.pageEnd}` : ''}` : 'Tema'}</small></summary>
    <p>{topic.summary}</p>{topic.keywords.length > 0 && <div className="keyword-row">{topic.keywords.slice(0, 6).map(word => <span key={word}>{word}</span>)}</div>}<button className="text-button" onClick={() => selectPage(topic.pageStart ?? 1)}>Ver página →</button>
  </details>
  const sectionOpen = (name: string) => openContentSection === name

  const pageAction = async (type: 'summary' | 'flashcards' | 'multiple_choice') => {
    setPageBusy(true); setPageError('')
    try { const id = await onPageArtifact(page, type); setPageArtifactId(id); setPanelOpen(true); setPanelTab('content'); setMobileTab('nexo') }
    catch (error) { setPageError(error instanceof Error ? error.message : 'No pudimos preparar este recurso. Reintenta.') }
    finally { setPageBusy(false) }
  }
  const prepareMore = (selection: 40 | 80 | 'range' | 'all') => {
    try {
      const pages = analysisPages(material, selection, moreStart, moreEnd)
      if (!pages.length) { setMoreError('Estas páginas ya están preparadas.'); return }
      onAnalyzeMore?.(pages); setMoreOpen(false)
    } catch (error) { setMoreError(error instanceof Error ? error.message : 'Revisa el rango.') }
  }

  return <section className="material-workspace" ref={shellRef}>
    <header className="material-workspace-head" ref={headRef}>
      <div><button className="text-button" onClick={onBack}>← {course.name}</button><h2>{title}</h2><p>{material.sourceName || 'Material de estudio'} · {material.pageCount ? `${material.pageCount} ${material.pageCount === 1 ? 'página' : 'páginas'}` : material.sourceType === 'pdf' ? 'Calculando páginas…' : 'Apuntes'}{page > 1 ? ` · Página ${page}` : ''}</p></div>
      <div className="material-workspace-head-actions"><span className="source-badge">{material.documentKind === 'scan' ? 'Documento escaneado' : analyzing ? 'Nexo preparando' : partial ? 'Análisis parcial' : analysisStatus === 'failed' ? 'Análisis pendiente' : ready ? 'Nexo listo' : 'Preparación pendiente'}</span><details className="material-layout-menu" ref={layoutMenuRef}><summary>Layout ▾</summary><div role="group" aria-label="Proporción entre documento y Nexo">{([30, 40, 50] as const).map(percent => <button key={percent} className={`secondary ${panelOpen && nexoPercent === percent ? 'active' : ''}`} aria-pressed={panelOpen && nexoPercent === percent} onClick={() => { setNexoPercent(percent); setPanelOpen(true); if (layoutMenuRef.current) layoutMenuRef.current.open = false }}>{100 - percent}/{percent}</button>)}</div></details><button className="secondary" aria-label={fullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'} onClick={() => { if (shellRef.current && document.fullscreenElement !== shellRef.current) void shellRef.current.requestFullscreen?.(); else if (document.fullscreenElement) void document.exitFullscreen?.() }}>⛶</button><button className="secondary panel-toggle" aria-label={panelOpen ? 'Ocultar Nexo' : 'Abrir Nexo'} onClick={() => setPanelOpen(value => !value)}>Nexo ◧</button></div>
    </header>
    {(analyzing || partial || analysisStatus === 'failed' || material.documentKind === 'scan' || !ready) && <div className="material-processing" role="status"><strong>{material.documentKind === 'scan' ? 'Este documento parece estar escaneado.' : analyzing ? `Nexo preparando · ${material.analysisProgress ? `${material.analysisProgress.completed}/${material.analysisProgress.total} páginas seleccionadas de ${material.pageCount ?? '…'}` : 'leyendo metadatos'}` : partial ? `Nexo ha preparado ${availablePages} de ${material.pageCount ?? '…'} páginas` : analysisStatus === 'failed' ? 'No pudimos preparar el análisis.' : 'Preparando tu material'}</strong><ol><li>✓ Documento</li><li>{analyzing && material.processingStage === 'reading' ? '●' : availablePages ? '✓' : '○'} Texto</li><li>{analyzing && material.processingStage === 'indexing' ? '●' : material.topics?.length ? '✓' : '○'} Indexando</li><li>{material.topics?.length ? '✓' : '○'} Temas</li></ol>{(analysisStatus === 'failed' || analysisStatus === 'not_started') && onRetry && <button className="secondary" onClick={onRetry}>Reintentar lectura</button>}{canAnalyzeMore && onAnalyzeMore && <button className="secondary" onClick={() => { setMoreError(''); setMoreOpen(true) }}>Analizar más páginas</button>}{material.documentKind === 'scan' && <button className="secondary" onClick={() => { setPanelTab('content'); setMobileTab('nexo'); setPanelOpen(true) }}>Analizar visualmente</button>}</div>}
    {material.sourceType === 'pdf' && material.pageCount && <div className="page-context-tools"><label>Página <input aria-label="Página del documento" type="number" min={1} max={material.pageCount} value={page} onChange={event => { const value = Number(event.target.value); if (Number.isInteger(value) && value >= 1 && value <= material.pageCount!) selectPage(value) }}/></label><details><summary>Sobre esta página</summary><div><button className="secondary" onClick={() => { setChatPage(page); setPanelOpen(true); setPanelTab('chat'); setMobileTab('nexo') }}>Preguntar a Nexo</button><button className="secondary" disabled={pageBusy} onClick={() => void pageAction('summary')}>Resumir página</button><button className="secondary" disabled={pageBusy} onClick={() => void pageAction('flashcards')}>Crear tarjetas</button><button className="secondary" disabled={pageBusy} onClick={() => void pageAction('multiple_choice')}>Crear preguntas</button></div></details>{pageBusy && <span role="status">Preparando esta página…</span>}{pageError && <p role="alert">{pageError}</p>}</div>}
    <div className="material-mobile-tabs" role="tablist" onKeyDown={tabKeyboard} aria-label="Vista del material"><button id={`material-tab-${material.id}`} aria-controls={`material-document-${material.id}`} role="tab" aria-selected={mobileTab === 'material'} onClick={() => setMobileTab('material')}>Material</button><button id={`nexo-tab-${material.id}`} aria-controls={`material-nexo-${material.id}`} role="tab" aria-selected={mobileTab === 'nexo'} onClick={() => { setMobileTab('nexo'); setPanelOpen(true) }}>Nexo IA</button></div>
    <div ref={splitRef} className={`material-split ${panelOpen ? '' : 'nexo-hidden'}`} style={panelOpen ? { gridTemplateColumns: `minmax(0, ${100 - nexoPercent}fr) 7px minmax(0, ${nexoPercent}fr)` } : undefined}>
      <div id={`material-document-${material.id}`} role="tabpanel" aria-labelledby={`material-tab-${material.id}`} className={`material-document ${mobileTab === 'material' ? 'mobile-active' : ''}`}>
        {material.sourceType === 'pdf' && pdfUrl ? <iframe key={`${pdfUrl}:${page}`} title={`PDF ${material.title}`} src={pdfPageUrl(pdfUrl, page)} /> : <div className="material-text-preview">{pdfError && <p role="status">{pdfError}</p>}{material.pages?.length ? material.pages.map(item => <article id={`material-page-${item.page}`} key={item.page}><small>Página {item.page}</small><p>{item.text}</p></article>) : <article><small>Material</small><p>{material.text}</p></article>}</div>}
      </div>
      {panelOpen && <><div className="material-divider" role="separator" aria-label="Ajustar ancho de Nexo" aria-orientation="vertical" aria-valuemin={30} aria-valuemax={60} aria-valuenow={nexoPercent} tabIndex={0} onPointerDown={startResize} onPointerMove={resize} onKeyDown={event => { if (event.key === 'ArrowLeft') setNexoPercent(value => Math.min(60, value + 5)); if (event.key === 'ArrowRight') setNexoPercent(value => Math.max(30, value - 5)) }}/><aside id={`material-nexo-${material.id}`} role="tabpanel" aria-labelledby={`nexo-tab-${material.id}`} className={`material-nexo-panel ${mobileTab === 'nexo' ? 'mobile-active' : ''}`} aria-label="Nexo IA del material">
        <div className="material-nexo-head"><strong>Nexo IA</strong><div role="tablist" onKeyDown={tabKeyboard} aria-label="Herramientas de Nexo"><button id={`nexo-chat-tab-${material.id}`} aria-controls={`nexo-chat-${material.id}`} role="tab" aria-selected={panelTab === 'chat'} className={panelTab === 'chat' ? 'active' : ''} onClick={() => setPanelTab('chat')}>Chat</button><button id={`nexo-content-tab-${material.id}`} aria-controls={`nexo-content-${material.id}`} role="tab" aria-selected={panelTab === 'content'} className={panelTab === 'content' ? 'active' : ''} onClick={() => setPanelTab('content')}>Contenido</button></div></div>
        {panelTab === 'content' ? <div id={`nexo-content-${material.id}`} role="tabpanel" aria-labelledby={`nexo-content-tab-${material.id}`} className="material-nexo-content">
          <h3>¿Qué quieres hacer con este material?</h3>{pageArtifact && <PageArtifactView key={pageArtifact.id} artifact={pageArtifact} onClose={() => setPageArtifactId('')} onRecall={onRecall} onReveal={index => onPageReveal(pageArtifact.id, index)} onAnswer={(label, index, correct) => onPageAnswer(pageArtifact.id, label, index, correct)}/>}
          <p>Nexo conserva el contexto de este documento y prepara cada método cuando lo necesites.</p>
          {!ready && <p role="status">{material.documentKind === 'scan' ? 'Analiza algunas páginas para habilitar los métodos de estudio.' : 'Disponible cuando Nexo termine de analizar este material.'}</p>}
          <details className="material-content-section" open={sectionOpen('Resumen')}><summary onClick={event => { event.preventDefault(); setOpenContentSection(value => value === 'Resumen' ? '' : 'Resumen') }}>Resumen</summary>
            <div className="material-minimum-summary"><strong>Vista rápida del material</strong><p>{summary || 'La síntesis aparecerá cuando Nexo prepare el contenido.'}</p></div>
          </details>
          {(material.documentKind === 'scan' || material.documentKind === 'mixed') && material.pageCount && <div className="material-visual-analysis">
            <strong>Analizar visualmente con Nexo</strong><p>Elige la página actual o un rango de hasta cuatro páginas. Solo se enviarán esas imágenes.</p>
            <div><label>Desde <input aria-label="Primera página visual" type="number" min={1} max={material.pageCount} value={rangeStart} onChange={event => setRangeStart(Number(event.target.value))}/></label><label>Hasta <input aria-label="Última página visual" type="number" min={1} max={material.pageCount} value={rangeEnd} onChange={event => setRangeEnd(Number(event.target.value))}/></label></div>
            <button className="secondary" disabled={visualBusy || Math.abs(rangeEnd - rangeStart) > 3 || Math.min(rangeStart, rangeEnd) < 1 || Math.max(rangeStart, rangeEnd) > material.pageCount} onClick={() => void analyzeVisual()}>{visualBusy ? 'Analizando páginas…' : 'Analizar visualmente'}</button>{visualError && <p role="alert">{visualError}</p>}
          </div>}
          <details className="material-content-section" open={sectionOpen('Temas')}><summary onClick={event => { event.preventDefault(); setOpenContentSection(value => value === 'Temas' ? '' : 'Temas') }}>Temas detectados{material.topics?.length ? ` · ${material.topics.length}` : ''}</summary>
            <div className="material-topics">{material.topics?.length ? material.topics.map(topicButton) : <p>Los temas aparecerán cuando Nexo termine de leer el documento.</p>}</div>
          </details>
          {methodGroups.map(group => <details className="material-content-section material-method-group" key={group.title} open={sectionOpen(group.title)}><summary onClick={event => { event.preventDefault(); setOpenContentSection(value => value === group.title ? '' : group.title) }}>{group.title}</summary><div className="material-methods">{methods.filter(method => group.modes.includes(method.mode)).map(method => <button key={method.mode} disabled={!ready} onClick={() => onStudy(method.mode)}><strong>{method.title}</strong><span>{method.description}{material.artifacts?.some(artifact => artifact.status === 'ready' && (artifact.type === method.mode || (method.mode === 'multiple-choice' && artifact.type === 'multiple_choice') || (method.mode === 'written' && artifact.type === 'written_questions') || (method.mode === 'fill-blanks' && artifact.type === 'fill_blanks'))) ? ' · Listo en tu biblioteca' : ''}</span></button>)}</div></details>)}
        </div> : <div id={`nexo-chat-${material.id}`} role="tabpanel" aria-labelledby={`nexo-chat-tab-${material.id}`} className="material-nexo-chat"><div className="material-chat-turns">{partial && ready && <p role="status">Nexo responderá usando {contextPageCount} {contextPageCount === 1 ? 'página preparada' : 'páginas preparadas'}.</p>}{turns.length ? turns.map((turn, index) => <article key={index}><div className="material-chat-question">{turn.question}</div><div className="material-chat-answer"><ResponseRenderer text={turn.answer}/>{turn.sources.length > 0 && <div className="material-chat-sources">{turn.sources.map((source, sourceIndex) => <button key={sourceIndex} onClick={() => selectPage(source.pageStart)}>{source.materialTitle} · página {source.pageStart}</button>)}</div>}</div></article>) : <p>{ready ? 'Pregunta sobre este material. Nexo buscará fragmentos relevantes y te mostrará las páginas usadas.' : 'Analiza páginas de este documento para comenzar a preguntar a Nexo.'}</p>}{busy && <p role="status">Nexo está revisando el material…</p>}</div><ChatComposer className="material-chat-composer" value={question} onChange={setQuestion} onSend={() => void send()} label="Preguntar sobre este material" placeholder={ready ? 'Pregunta a Nexo sobre este material…' : 'Prepara algunas páginas para conversar…'} busy={busy} disabled={!ready && !chatPage}>{chatPage && <div className="page-chat-context">Contexto: Página {chatPage}<button className="text-button" onClick={() => setChatPage(null)}>Usar todo el material</button></div>}{chatError && <p role="alert">{chatError}</p>}</ChatComposer></div>}
      </aside></>}
    </div>
    {moreOpen && <Dialog title="Preparar más páginas" onClose={() => setMoreOpen(false)} className="modal"><div className="modal-head"><h2>Preparar más páginas</h2><button aria-label="Cerrar diálogo" onClick={() => setMoreOpen(false)}>×</button></div><p>{availablePages} de {material.pageCount} páginas preparadas. Un rango grande puede tardar más; los recursos de IA se crean solo cuando los pides.</p><div className="solution-actions"><button className="secondary" onClick={() => prepareMore(40)}>Siguientes 40</button><button className="secondary" onClick={() => prepareMore(80)}>Siguientes 80</button><button className="secondary" onClick={() => prepareMore('all')}>Todo lo pendiente</button></div><label>Desde<input aria-label="Inicio del rango" type="number" min={1} max={material.pageCount} value={moreStart} onChange={event => setMoreStart(Number(event.target.value))}/></label><label>Hasta<input aria-label="Final del rango" type="number" min={1} max={material.pageCount} value={moreEnd} onChange={event => setMoreEnd(Number(event.target.value))}/></label><button className="primary" onClick={() => prepareMore('range')}>Preparar rango</button>{moreError && <p role="alert">{moreError}</p>}</Dialog>}
  </section>
}
