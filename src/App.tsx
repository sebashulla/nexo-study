import { useEffect, useMemo, useState } from 'react'
import { demoCourses } from './data/demo'
import { extractPdf } from './lib/documentEngine'
import { generateStudyPack } from './lib/studyEngine'
import { generateStudyPackWithAI } from './lib/studyAi'
import { askMaterial } from './lib/tutorEngine'
import { coursePath, materialPath, parseAppRoute, tabPath, type AppTab } from './lib/router'
import type { Course, Material, StudyFocus, StudyLevel, StudyPack, TutorAnswer } from './types'
import { ResolverPage } from './ResolverPage'
import { CorrectorPage } from './CorrectorPage'
import { FoldersPage } from './FoldersPage'
import { AuthPage } from './auth/AuthPage'
import { useAuth } from './auth/AuthContext'
import type { User } from '@supabase/supabase-js'
import { BrandLogo } from './BrandLogo'
import { FeedbackWidget } from './FeedbackWidget'
import { AdminFeedbackPage } from './AdminFeedbackPage'

type StudyMode = 'summary' | 'flashcards' | 'quiz' | 'exam' | 'tutor'

const uid = () => Math.random().toString(36).slice(2, 9)
const STORAGE_PREFIX = 'nexo-study-courses-v5:'
const LEGACY_KEYS = ['nexo-study-courses-v3', 'nexo-study-courses-v1']

const studyFocusOptions: { value: StudyFocus; icon: string; label: string; hint: string }[] = [
  { value: 'balanced', icon: '✦', label: 'Equilibrado', hint: 'Comprender + recordar + practicar' },
  { value: 'understand', icon: '🧠', label: 'Comprender', hint: 'Relaciones, causas y mecanismos' },
  { value: 'memorize', icon: '⚡', label: 'Memorizar', hint: 'Definiciones y datos clave' },
  { value: 'exam', icon: '🎯', label: 'Examen', hint: 'Preguntas y errores frecuentes' },
]

const studyLevelOptions: { value: StudyLevel; label: string }[] = [
  { value: 'essential', label: 'Esencial' },
  { value: 'university', label: 'Universitario' },
  { value: 'advanced', label: 'Avanzado' },
]

function loadInitialCourses(userId: string): Course[] {
  try {
    const ownKey = `${STORAGE_PREFIX}${userId}`
    const own = localStorage.getItem(ownKey)
    if (own) return JSON.parse(own)
    const legacy = LEGACY_KEYS.map(key => localStorage.getItem(key)).find(Boolean)
    if (legacy) {
      localStorage.setItem(ownKey, legacy)
      LEGACY_KEYS.forEach(key => localStorage.removeItem(key))
      return JSON.parse(legacy)
    }
    return demoCourses
  } catch { return demoCourses }
}

function App() {
  const { loading, user, signOut } = useAuth()
  if (loading) return <div className="app-loading"><BrandLogo iconOnly/><strong>Cargando Nexo…</strong></div>
  if (!user) return <AuthPage />
  if (window.location.pathname === '/nexo-ops/feedback-console') return <AdminFeedbackPage />
  return <StudyApp key={user.id} user={user} signOut={signOut} />
}

function StudyApp({ user, signOut }: { user: User; signOut: () => Promise<void> }) {
  const [pathname, setPathname] = useState(window.location.pathname)
  const route = useMemo(() => parseAppRoute(pathname), [pathname])
  const tab = route.tab
  const [courses, setCourses] = useState<Course[]>(() => loadInitialCourses(user.id))
  const [activeCourseId, setActiveCourseId] = useState(route.courseId || courses[0]?.id || '')
  const [activeMaterialId, setActiveMaterialId] = useState(route.materialId || courses[0]?.materials[0]?.id || '')
  const [showCourseForm, setShowCourseForm] = useState(false)
  const [showMaterialForm, setShowMaterialForm] = useState(false)
  const [courseName, setCourseName] = useState('')
  const [courseEmoji, setCourseEmoji] = useState('📘')
  const [materialTitle, setMaterialTitle] = useState('')
  const [materialText, setMaterialText] = useState('')
  const [materialPages, setMaterialPages] = useState<Material['pages']>()
  const [sourceType, setSourceType] = useState<Material['sourceType']>('text')
  const [sourceName, setSourceName] = useState('')
  const [importStatus, setImportStatus] = useState('')
  const [studyFocus, setStudyFocus] = useState<StudyFocus>('balanced')
  const [studyLevel, setStudyLevel] = useState<StudyLevel>('university')
  const [studyMode, setStudyMode] = useState<StudyMode>('summary')
  const [flashIndex, setFlashIndex] = useState(0)
  const [flashRevealed, setFlashRevealed] = useState(false)
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>({})
  const [examAnswers, setExamAnswers] = useState<Record<number, number>>({})
  const [showAccountMenu, setShowAccountMenu] = useState(false)
  const [aiGeneratingMaterialId, setAiGeneratingMaterialId] = useState<string | null>(null)
  const [aiGenerationErrors, setAiGenerationErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname)
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const navigate = (path: string, replace = false) => {
    if (window.location.pathname === path) return
    window.history[replace ? 'replaceState' : 'pushState']({}, '', path)
    setPathname(path)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const setTab = (next: AppTab) => navigate(tabPath(next))

  useEffect(() => { localStorage.setItem(`${STORAGE_PREFIX}${user.id}`, JSON.stringify(courses)) }, [courses, user.id])

  useEffect(() => {
    if (route.courseId) setActiveCourseId(route.courseId)
    if (route.materialId) setActiveMaterialId(route.materialId)
  }, [route.courseId, route.materialId])

  const selectedCourse = courses.find(course => course.id === activeCourseId)
  const activeCourse = route.courseId ? courses.find(course => course.id === route.courseId) : (selectedCourse ?? courses[0])
  const activeMaterial = activeCourse
    ? (route.materialId ? activeCourse.materials.find(material => material.id === route.materialId) : (activeCourse.materials.find(material => material.id === activeMaterialId) ?? activeCourse.materials[0]))
    : undefined

  useEffect(() => {
    if (!activeCourse) return
    if (!activeCourse.materials.some(material => material.id === activeMaterialId)) setActiveMaterialId(activeCourse.materials[0]?.id ?? '')
  }, [activeCourseId, activeCourse, activeMaterialId])

  const pack: StudyPack | null = useMemo(() => activeMaterial?.text ? (activeMaterial.studyPack || generateStudyPack(activeMaterial.text, 10)) : null, [activeMaterial])
  const quickPack: StudyPack | null = useMemo(() => pack ? { ...pack, quiz: pack.quiz.slice(0, 5) } : null, [pack])
  const examPack: StudyPack | null = pack
  const totalMaterials = courses.reduce((acc, course) => acc + course.materials.length, 0)
  const pdfMaterials = courses.reduce((acc, course) => acc + course.materials.filter(m => m.sourceType === 'pdf').length, 0)
  const aiPreparedMaterials = courses.reduce((acc, course) => acc + course.materials.filter(m => m.studyPackMeta?.source === 'nexo-ai').length, 0)

  const resetStudy = () => { setQuizAnswers({}); setExamAnswers({}); setFlashIndex(0); setFlashRevealed(false) }

  const updateMaterial = (courseId: string, materialId: string, updater: (material: Material) => Material) => {
    setCourses(current => current.map(course => course.id !== courseId ? course : {
      ...course,
      materials: course.materials.map(material => material.id === materialId ? updater(material) : material),
    }))
  }

  const prepareMaterialWithAI = async (courseId: string, courseNameValue: string, material: Material, focus: StudyFocus, level: StudyLevel) => {
    setAiGeneratingMaterialId(material.id)
    setAiGenerationErrors(current => ({ ...current, [material.id]: '' }))
    try {
      const { pack: generatedPack, sampledPages } = await generateStudyPackWithAI({ courseName: courseNameValue, material, focus, level })
      updateMaterial(courseId, material.id, current => ({
        ...current,
        studyPack: generatedPack,
        studyPackMeta: { source: 'nexo-ai', generatedAt: new Date().toISOString(), focus, level, sampledPages },
      }))
    } catch (error) {
      setAiGenerationErrors(current => ({ ...current, [material.id]: error instanceof Error ? error.message : 'Nexo IA no pudo preparar este material.' }))
    } finally {
      setAiGeneratingMaterialId(current => current === material.id ? null : current)
    }
  }

  const addCourse = () => {
    const name = courseName.trim(); if (!name) return
    const course: Course = { id: `course-${uid()}`, name, emoji: courseEmoji, materials: [] }
    setCourses(prev => [...prev, course])
    setActiveCourseId(course.id)
    setCourseName(''); setCourseEmoji('📘'); setShowCourseForm(false)
    navigate(coursePath(course.id))
  }

  const resetMaterialForm = () => {
    setMaterialTitle(''); setMaterialText(''); setMaterialPages(undefined); setSourceType('text'); setSourceName(''); setImportStatus('')
    setStudyFocus('balanced'); setStudyLevel('university')
  }

  const addMaterial = async () => {
    if (!activeCourse || !materialTitle.trim() || !materialText.trim()) return
    const material: Material = {
      id: `mat-${uid()}`,
      title: materialTitle.trim(),
      text: materialText.trim(),
      createdAt: new Date().toISOString(),
      sourceType,
      sourceName: sourceName || undefined,
      pages: materialPages,
    }
    const courseId = activeCourse.id
    const courseNameValue = activeCourse.name
    const focus = studyFocus
    const level = studyLevel
    setCourses(prev => prev.map(course => course.id === courseId ? { ...course, materials: [...course.materials, material] } : course))
    setActiveMaterialId(material.id)
    resetStudy()
    setShowMaterialForm(false)
    resetMaterialForm()
    navigate(materialPath(courseId, material.id))
    if (material.sourceType === 'pdf') void prepareMaterialWithAI(courseId, courseNameValue, material, focus, level)
  }

  const importFile = async (file?: File) => {
    if (!file) return
    setMaterialTitle(file.name.replace(/\.(txt|md|pdf)$/i, ''))
    setSourceName(file.name)
    setImportStatus('Leyendo archivo…')
    try {
      if (/\.(txt|md)$/i.test(file.name)) {
        setMaterialText(await file.text()); setMaterialPages(undefined); setSourceType('text'); setImportStatus('✓ Texto importado correctamente')
      } else if (/\.pdf$/i.test(file.name)) {
        const result = await extractPdf(file)
        setMaterialText(result.text); setMaterialPages(result.pages); setSourceType('pdf')
        setImportStatus(`✓ PDF procesado: ${result.pages.length} páginas. Nexo IA lo preparará al guardar.`)
      } else {
        setImportStatus('Formato no compatible todavía. Usa PDF, TXT o MD.')
      }
    } catch (error) {
      setImportStatus(`⚠ ${error instanceof Error ? error.message : 'No se pudo leer el archivo.'}`)
    }
  }

  const openCourse = (id: string) => {
    setActiveCourseId(id)
    const course = courses.find(item => item.id === id)
    setActiveMaterialId(course?.materials[0]?.id ?? '')
    navigate(coursePath(id))
  }

  const openMaterial = (courseId: string, materialId: string) => {
    setActiveCourseId(courseId); setActiveMaterialId(materialId); resetStudy(); navigate(materialPath(courseId, materialId))
  }

  const regenerateActiveMaterial = () => {
    if (!activeCourse || !activeMaterial) return
    const focus = activeMaterial.studyPackMeta?.focus || 'balanced'
    const level = activeMaterial.studyPackMeta?.level || 'university'
    void prepareMaterialWithAI(activeCourse.id, activeCourse.name, activeMaterial, focus, level)
  }

  const topTitle = route.courseId && tab === 'cursos' && activeCourse
    ? `${activeCourse.emoji} ${activeCourse.name}`
    : route.materialId && activeMaterial
      ? activeMaterial.title
      : tabTitle(tab)

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setTab('inicio')} aria-label="Ir al inicio"><BrandLogo compact/></button>
        <nav>
          <NavButton icon="⌂" label="Inicio" active={tab === 'inicio'} onClick={() => setTab('inicio')} />
          <NavButton icon="▦" label="Mis cursos" active={tab === 'cursos'} onClick={() => setTab('cursos')} />
          <NavButton icon="▱" label="Carpetas" active={tab === 'carpetas'} onClick={() => setTab('carpetas')} />
          <NavButton icon="⌁" label="Resolver" active={tab === 'resolver'} onClick={() => setTab('resolver')} />
          <NavButton icon="✎" label="Corrector" active={tab === 'corrector'} onClick={() => setTab('corrector')} />
          <NavButton icon="✦" label="Estudiar" active={tab === 'estudiar'} onClick={() => setTab('estudiar')} />
          <NavButton icon="↗" label="Progreso" active={tab === 'progreso'} onClick={() => setTab('progreso')} />
        </nav>
        <div className="sidebar-card"><span>✦</span><strong>V0.8 · Beta</strong><p>Rutas reales por curso y material, PDFs preparados automáticamente con Nexo IA.</p></div>
      </aside>

      <main className="main-content">
        <header className="topbar"><div><p className="eyebrow">Tu espacio de estudio</p><h1>{topTitle}</h1></div><div className="top-actions"><div className="ai-chip"><span className="status-dot"></span><strong>Nexo IA</strong></div><div className="account-wrap"><button className="avatar" onClick={() => setShowAccountMenu(value => !value)}>{(user.user_metadata?.full_name || user.email || 'N').trim().charAt(0).toUpperCase()}</button>{showAccountMenu && <div className="account-menu"><strong>{user.user_metadata?.full_name || 'Estudiante Nexo'}</strong><span>{user.email}</span><button onClick={() => signOut()}>Cerrar sesión</button></div>}</div></div></header>

        {(route.courseId || route.materialId) && <div className="route-breadcrumbs"><button onClick={() => navigate('/courses')}>Cursos</button>{activeCourse && <><span>›</span><button onClick={() => navigate(coursePath(activeCourse.id))}>{activeCourse.emoji} {activeCourse.name}</button></>}{route.materialId && activeMaterial && <><span>›</span><strong>{activeMaterial.title}</strong></>}</div>}

        {tab === 'inicio' && <section className="page-grid">
          <div className="hero-card"><div><span className="pill">Nexo Study · Beta V0.8</span><h2>Sube un PDF. Nexo lo convierte en una sesión de estudio.</h2><p>El contenido se procesa por páginas y Nexo IA prepara resumen, flashcards y preguntas con referencias al material antes de que empieces a estudiar.</p><div className="hero-actions"><button className="primary" onClick={() => setShowMaterialForm(true)}>Subir material</button><button className="secondary" onClick={() => setTab('cursos')}>Ver mis cursos</button></div></div><div className="hero-orb"><span>AI</span><small>PDF → Study</small></div></div>
          <div className="stats-grid"><Stat label="Cursos" value={`${courses.length}`} hint="organizados"/><Stat label="Materiales" value={`${totalMaterials}`} hint="guardados"/><Stat label="PDF preparados" value={`${aiPreparedMaterials}`} hint="con Nexo IA"/><Stat label="Resolver" value="Nexo IA" hint="texto + imagen"/></div>
          <section className="panel wide"><div className="section-head"><div><p className="eyebrow">Continúa</p><h3>Tus cursos</h3></div><button className="text-button" onClick={() => setShowCourseForm(true)}>+ Nuevo curso</button></div><div className="course-row">{courses.map(course => <button className="course-mini" key={course.id} onClick={() => openCourse(course.id)}><span>{course.emoji}</span><div><strong>{course.name}</strong><small>{course.materials.length} materiales</small></div><b>›</b></button>)}</div></section>
        </section>}

        {tab === 'cursos' && !route.courseId && <section className="course-library-page">
          <div className="library-intro"><div><p className="eyebrow">Biblioteca</p><h2>Elige un curso</h2><p>Cada curso tiene ahora su propia dirección y espacio de materiales.</p></div><button className="primary" onClick={() => setShowCourseForm(true)}>+ Nuevo curso</button></div>
          <div className="course-library-grid">{courses.map(course => <button className="course-library-card" key={course.id} onClick={() => openCourse(course.id)}><span>{course.emoji}</span><div><strong>{course.name}</strong><small>{course.materials.length} materiales</small></div><b>Entrar →</b></button>)}</div>
        </section>}

        {tab === 'cursos' && route.courseId && <section className="course-page">
          {activeCourse ? <>
            <div className="course-page-hero"><div className="course-page-emoji">{activeCourse.emoji}</div><div><p className="eyebrow">Curso</p><h2>{activeCourse.name}</h2><p>{activeCourse.materials.length} materiales · Cada PDF puede convertirse automáticamente en una sesión activa.</p></div><button className="primary" onClick={() => setShowMaterialForm(true)}>+ Agregar material</button></div>
            {activeCourse.materials.length ? <div className="materials-grid course-materials-grid">{activeCourse.materials.map(material => <button className="material-card" key={material.id} onClick={() => openMaterial(activeCourse.id, material.id)}><div className="material-meta"><span className="file-icon">{material.sourceType === 'pdf' ? 'PDF' : '≡'}</span>{material.pages?.length ? <span className="source-badge">{material.pages.length} págs.</span> : null}{material.studyPackMeta?.source === 'nexo-ai' && <span className="ai-ready-badge">✦ IA lista</span>}</div><strong>{material.title}</strong><p>{material.text.replace(/\[Página \d+\]/g, '').slice(0, 125)}{material.text.length > 125 ? '…' : ''}</p><small>Entrar a la sesión →</small></button>)}</div> : <EmptyState title="Todavía no hay materiales" text="Sube un PDF. Nexo IA generará el primer paquete de estudio automáticamente." action="Agregar material" onClick={() => setShowMaterialForm(true)} />}
          </> : <EmptyState title="Curso no encontrado" text="Este curso no existe en este dispositivo." action="Volver a cursos" onClick={() => navigate('/courses')} />}
        </section>}

        {tab === 'carpetas' && <FoldersPage courses={courses} onOpenCourse={openCourse} />}
        {tab === 'resolver' && <ResolverPage />}
        {tab === 'corrector' && <CorrectorPage />}

        {tab === 'estudiar' && <section className="study-layout">
          <aside className="panel material-nav"><div className="section-head compact"><div><p className="eyebrow">Material</p><h3>{activeCourse?.name ?? 'Curso'}</h3></div></div>{activeCourse?.materials.map(material => <button key={material.id} className={`material-nav-item ${activeMaterial?.id === material.id ? 'active' : ''}`} onClick={() => openMaterial(activeCourse.id, material.id)}><span>{material.sourceType === 'pdf' ? 'P' : '≡'}</span><div><strong>{material.title}</strong><small>{material.studyPackMeta?.source === 'nexo-ai' ? '✦ Preparado por Nexo IA' : material.pages?.length ? `${material.pages.length} páginas` : `${material.text.length} caracteres`}</small></div></button>)}<button className="secondary full" onClick={() => setShowMaterialForm(true)}>+ Agregar material</button></aside>
          <div className="panel study-stage">{pack && quickPack && examPack && activeMaterial ? <>
            <div className="study-heading"><div><p className="eyebrow">Sesión de estudio</p><h2>{activeMaterial.title}</h2>{activeMaterial.sourceName && <small className="source-line">{activeMaterial.sourceType === 'pdf' ? '📄' : '📝'} {activeMaterial.sourceName}</small>}</div><div className="study-heading-actions"><button className="secondary ai-regenerate" disabled={aiGeneratingMaterialId === activeMaterial.id} onClick={regenerateActiveMaterial}>{aiGeneratingMaterialId === activeMaterial.id ? '✦ Preparando…' : '✦ Regenerar con Nexo IA'}</button><div className="mode-tabs"><button className={studyMode === 'summary' ? 'active' : ''} onClick={() => setStudyMode('summary')}>Resumen</button><button className={studyMode === 'flashcards' ? 'active' : ''} onClick={() => setStudyMode('flashcards')}>Flashcards</button><button className={studyMode === 'quiz' ? 'active' : ''} onClick={() => setStudyMode('quiz')}>Quiz</button><button className={studyMode === 'exam' ? 'active' : ''} onClick={() => setStudyMode('exam')}>Simulacro</button><button className={studyMode === 'tutor' ? 'active' : ''} onClick={() => setStudyMode('tutor')}>Tutor</button></div></div></div>
            {aiGeneratingMaterialId === activeMaterial.id && <StudyGenerationBanner material={activeMaterial} />}
            {aiGenerationErrors[activeMaterial.id] && <div className="study-ai-error"><div><strong>No pude completar la preparación con IA.</strong><p>{aiGenerationErrors[activeMaterial.id]} Puedes seguir estudiando con el paquete local o intentarlo otra vez.</p></div><button className="secondary" onClick={regenerateActiveMaterial}>Reintentar</button></div>}
            {studyMode === 'summary' && <SummaryView pack={pack} material={activeMaterial} />}
            {studyMode === 'flashcards' && <FlashcardView pack={pack} index={flashIndex} revealed={flashRevealed} setIndex={setFlashIndex} setRevealed={setFlashRevealed} />}
            {studyMode === 'quiz' && <QuizView pack={quickPack} answers={quizAnswers} setAnswers={setQuizAnswers} title="Quiz rápido" />}
            {studyMode === 'exam' && <QuizView pack={examPack} answers={examAnswers} setAnswers={setExamAnswers} title="Simulacro del material" exam />}
            {studyMode === 'tutor' && <TutorView material={activeMaterial} />}
          </> : <EmptyState title="No hay material seleccionado" text="Entra a un curso y agrega un PDF para crear una sesión de estudio." action="Ver cursos" onClick={() => navigate('/courses')} />}</div>
        </section>}

        {tab === 'progreso' && <section className="page-grid"><div className="stats-grid"><Stat label="Cursos" value={`${courses.length}`} hint="activos"/><Stat label="Materiales" value={`${totalMaterials}`} hint="biblioteca"/><Stat label="PDF" value={`${pdfMaterials}`} hint="procesados"/><Stat label="IA preparada" value={`${aiPreparedMaterials}`} hint="sesiones generadas"/></div><div className="panel wide roadmap-card"><p className="eyebrow">V0.8 beta</p><h3>Una ruta distinta para cada parte de tu estudio</h3><div className="feature-grid"><Feature icon="🔗" title="Rutas reales" text="Cursos y materiales tienen URLs separadas, listas para compartir y navegar con atrás/adelante."/><Feature icon="✦" title="PDF → Nexo IA" text="Al guardar un PDF se genera automáticamente resumen, flashcards y quiz."/><Feature icon="📄" title="Muestreo por páginas" text="Nexo distribuye la lectura a lo largo del PDF y conserva referencias de página."/><Feature icon="🎯" title="Perfil de estudio" text="Elige comprender, memorizar, equilibrado o preparación de examen."/><Feature icon="🧠" title="Fallback local" text="Si la IA no responde, el material sigue siendo estudiable sin bloquearte."/><Feature icon="☁️" title="Supabase" text="Cuenta, onboarding, carpetas, feedback y administración protegida por RLS."/></div></div></section>}
      </main>

      {showCourseForm && <Modal title="Nuevo curso" onClose={() => setShowCourseForm(false)}><div className="course-emoji-preview"><span>{courseEmoji}</span><div><strong>Dale una identidad a tu curso</strong><small>El emoji hará que sea más fácil reconocerlo de un vistazo.</small></div></div><div className="course-emoji-picker">{['📘','🧠','🧪','🩺','🦷','📐','⚛️','💻','📚','🌎','⚖️','💹','🧬','🔬','🎨','🎯'].map(emoji => <button key={emoji} className={courseEmoji === emoji ? 'active' : ''} onClick={() => setCourseEmoji(emoji)}>{emoji}</button>)}</div><label>Nombre del curso<input autoFocus value={courseName} onChange={e => setCourseName(e.target.value)} placeholder="Ej. Histología" onKeyDown={e => e.key === 'Enter' && addCourse()} /></label><div className="modal-actions"><button className="secondary" onClick={() => setShowCourseForm(false)}>Cancelar</button><button className="primary" onClick={addCourse}>Crear curso</button></div></Modal>}

      {showMaterialForm && <Modal title={`Agregar material${activeCourse ? ` · ${activeCourse.name}` : ''}`} onClose={() => { setShowMaterialForm(false); resetMaterialForm() }} wide>{!activeCourse ? <p>Primero crea un curso.</p> : <><div className="upload-box"><input id="file-upload" type="file" accept=".txt,.md,.pdf" onChange={e => importFile(e.target.files?.[0])}/><label htmlFor="file-upload"><span>↑</span><strong>Subir PDF, TXT o MD</strong><small>Los PDF se leen por páginas. Al guardarlos Nexo IA prepara automáticamente tu sesión.</small></label></div>{importStatus && <div className={`import-status ${importStatus.startsWith('⚠') ? 'error' : ''}`}>{importStatus}</div>}<label>Título<input value={materialTitle} onChange={e => setMaterialTitle(e.target.value)} placeholder="Ej. Clase 04 — Patología oral" /></label><label>Texto extraído / apuntes<textarea rows={7} value={materialText} onChange={e => { setMaterialText(e.target.value); if (!sourceName) setSourceType('text') }} placeholder="También puedes pegar aquí tus apuntes directamente…" /></label>{sourceType === 'pdf' && <div className="study-profile-box"><div><p className="eyebrow">Ayuda a Nexo IA</p><h3>¿Cómo quieres estudiar este PDF?</h3><p>Esta guía cambia el tipo de flashcards y preguntas que se generan.</p></div><div className="study-focus-grid">{studyFocusOptions.map(option => <button key={option.value} className={studyFocus === option.value ? 'active' : ''} onClick={() => setStudyFocus(option.value)}><span>{option.icon}</span><div><strong>{option.label}</strong><small>{option.hint}</small></div></button>)}</div><div className="study-level-row"><span>Nivel</span>{studyLevelOptions.map(option => <button key={option.value} className={studyLevel === option.value ? 'active' : ''} onClick={() => setStudyLevel(option.value)}>{option.label}</button>)}</div></div>}<div className="modal-actions"><button className="secondary" onClick={() => { setShowMaterialForm(false); resetMaterialForm() }}>Cancelar</button><button className="primary" disabled={!materialTitle.trim() || !materialText.trim()} onClick={addMaterial}>{sourceType === 'pdf' ? 'Guardar y preparar con Nexo IA' : 'Guardar y estudiar'}</button></div></>}</Modal>}
      <FeedbackWidget context={pathname} />
    </div>
  )
}

function NavButton({ icon, label, active, onClick }: { icon: string; label: string; active: boolean; onClick: () => void }) { return <button className={`nav-button ${active ? 'active' : ''}`} onClick={onClick}><span>{icon}</span>{label}</button> }
function Stat({ label, value, hint }: { label: string; value: string; hint: string }) { return <div className="stat-card"><p>{label}</p><strong>{value}</strong><small>{hint}</small></div> }
function Feature({ icon, title, text }: { icon: string; title: string; text: string }) { return <div className="feature-card"><span>{icon}</span><div><strong>{title}</strong><p>{text}</p></div></div> }
function EmptyState({ title, text, action, onClick }: { title: string; text: string; action: string; onClick: () => void }) { return <div className="empty-state"><span>✦</span><h3>{title}</h3><p>{text}</p><button className="primary" onClick={onClick}>{action}</button></div> }

function StudyGenerationBanner({ material }: { material: Material }) {
  return <div className="study-generating"><div className="study-generating-orb">✦</div><div><strong>Nexo IA está preparando tu sesión</strong><p>Analizando {material.pages?.length ? `${material.pages.length} páginas` : 'el material'}, seleccionando conceptos importantes y construyendo flashcards + preguntas.</p><div className="study-generation-track"><span/></div></div></div>
}

function SummaryView({ pack, material }: { pack: StudyPack; material: Material }) {
  const ai = material.studyPackMeta?.source === 'nexo-ai'
  return <div className="study-content"><div className="ai-note"><span>{ai ? '✦' : '⚙'}</span><div><strong>{ai ? 'Preparado por Nexo IA' : 'Paquete local de respaldo'}</strong><p>{ai ? `Generado para un enfoque ${material.studyPackMeta?.focus || 'equilibrado'}${material.studyPackMeta?.sampledPages?.length ? ` · ${material.studyPackMeta.sampledPages.length} páginas muestreadas` : ''}.` : 'Este material sigue disponible aunque la generación con IA todavía no se haya completado.'}</p></div></div><div className="keyword-row">{pack.keywords.slice(0, 10).map(k => <span key={k}>{k}</span>)}</div><div className="summary-list">{pack.summary.map((item, index) => <div key={index}><span>{String(index + 1).padStart(2, '0')}</span><p>{item.replace(/\.$/, '')}.</p></div>)}</div></div>
}

function FlashcardView({ pack, index, revealed, setIndex, setRevealed }: { pack: StudyPack; index: number; revealed: boolean; setIndex: (n: number) => void; setRevealed: (v: boolean) => void }) {
  const safeIndex = Math.min(index, Math.max(0, pack.flashcards.length - 1))
  const card = pack.flashcards[safeIndex]
  if (!card) return <div className="tutor-empty"><span>✦</span><p>No hay flashcards disponibles todavía.</p></div>
  const move = (delta: number) => { setIndex((safeIndex + delta + pack.flashcards.length) % pack.flashcards.length); setRevealed(false) }
  return <div className="flash-wrap"><p className="counter">Tarjeta {safeIndex + 1} de {pack.flashcards.length}{card.sourcePage ? ` · Página ${card.sourcePage}` : ''}</p><button className={`flashcard ${revealed ? 'revealed' : ''}`} onClick={() => setRevealed(!revealed)}><small>{revealed ? 'RESPUESTA' : 'PREGUNTA'}</small><strong>{revealed ? card.back : card.front}</strong><span>{revealed ? 'Toca para volver' : 'Toca para revelar'}</span></button><div className="flash-controls"><button className="secondary" onClick={() => move(-1)}>← Anterior</button><button className="primary" onClick={() => move(1)}>Siguiente →</button></div></div>
}

function QuizView({ pack, answers, setAnswers, title, exam = false }: { pack: StudyPack; answers: Record<number, number>; setAnswers: (value: Record<number, number>) => void; title: string; exam?: boolean }) {
  const answered = Object.keys(answers).length
  const correct = Object.entries(answers).filter(([i, a]) => pack.quiz[Number(i)]?.answer === a).length
  return <div className="quiz-list"><div className="quiz-toolbar"><div><p className="eyebrow">{exam ? 'Modo examen' : 'Práctica'}</p><h3>{title}</h3></div><div className="score-chip">{answered}/{pack.quiz.length} · {answered ? Math.round(correct / answered * 100) : 0}%</div></div>{pack.quiz.map((question, qi) => { const selected = answers[qi]; const done = selected !== undefined; return <article className="quiz-card" key={qi}><div className="question-number">Pregunta {qi + 1}{question.sourcePage ? ` · pág. ${question.sourcePage}` : ''}</div><h3>{question.question}</h3><div className="options">{question.options.map((option, oi) => { const ok = done && oi === question.answer; const wrong = done && oi === selected && oi !== question.answer; return <button disabled={done} className={`${ok ? 'correct' : ''} ${wrong ? 'wrong' : ''}`} key={oi} onClick={() => setAnswers({ ...answers, [qi]: oi })}><span>{String.fromCharCode(65 + oi)}</span>{option}</button> })}</div>{done && <div className={`feedback ${selected === question.answer ? 'ok' : 'no'}`}><strong>{selected === question.answer ? '✓ Correcto' : '✕ Revisa esta idea'}</strong><p>{question.explanation}</p></div>}</article>})}</div>
}

function TutorView({ material }: { material: Material }) {
  const [question, setQuestion] = useState('')
  const [history, setHistory] = useState<{ q: string; a: TutorAnswer }[]>([])
  const ask = () => { const q = question.trim(); if (!q) return; setHistory(prev => [...prev, { q, a: askMaterial(material, q) }]); setQuestion('') }
  return <div className="tutor-wrap"><div className="ai-note"><span>🧠</span><div><strong>Tutor del material</strong><p>Busca evidencia dentro del documento y conserva referencias de página cuando están disponibles.</p></div></div><div className="tutor-chat">{history.length === 0 && <div className="tutor-empty"><span>✦</span><p>Prueba: “¿Qué función tiene…?”, “¿Cuál es la diferencia entre…?” o escribe un concepto del PDF.</p></div>}{history.map((item, i) => <div className="chat-turn" key={i}><div className="user-bubble">{item.q}</div><div className="tutor-bubble"><div className="confidence">Confianza {item.a.confidence}</div><p>{item.a.answer}</p>{item.a.citations.length > 0 && <div className="citations">{item.a.citations.map((c, j) => <div key={j}><strong>{c.page ? `Página ${c.page}` : 'Material'}</strong><span>{c.excerpt}</span></div>)}</div>}</div></div>)}</div><div className="tutor-input"><textarea rows={2} value={question} onChange={e => setQuestion(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask() } }} placeholder="Pregunta algo sobre este material…"/><button className="primary" onClick={ask}>Preguntar</button></div></div>
}

function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) { return <div className="modal-backdrop" onMouseDown={onClose}><div className={`modal ${wide ? 'wide-modal' : ''}`} onMouseDown={e => e.stopPropagation()}><div className="modal-head"><h2>{title}</h2><button onClick={onClose}>×</button></div>{children}</div></div> }
function tabTitle(tab: AppTab) { return ({ inicio: 'Buenas noches 👋', cursos: 'Mis cursos', carpetas: 'Carpetas', resolver: 'Resolver con Nexo IA', corrector: 'Corrector de trabajos', estudiar: 'Sala de estudio', progreso: 'Tu progreso' } as const)[tab] }
export default App
