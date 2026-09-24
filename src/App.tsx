import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { demoCourses } from './data/demo'
import { extractPdf, MAX_PDF_BYTES } from './lib/documentEngine'
import { chunksForMaterial, topicsForMaterial } from './lib/learningContext'
import { saveActivity, saveArtifact, saveCourses, saveLearningState, saveMaterialContext, saveSessions, signedPdfUrl, synchronizeCourses, uploadPrivatePdf } from './lib/learningRepository'
import { applyRecall, loadLearningMemory, masterySummary, saveLearningMemory, type LearningMemory, type RecallRating } from './lib/learningState'
import { buildStudySession, completeSessionStep, loadLocalSessions, saveLocalSessions, type SessionDuration, type SessionObjective } from './lib/studySessions'
import { artifactFlashcards, artifactQuestions, generateArtifactWithAI } from './lib/artifactPrompts'
import { generateStudyPack } from './lib/studyEngine'
import { generateStudyPackWithAI } from './lib/studyAi'
import { askMaterial } from './lib/tutorEngine'
import { coursePath, courseSectionPath, materialPath, materialStudyPath, materialWorkspacePath, parseAppRoute, tabPath, type AppTab, type MaterialStudyMode, type CourseSection } from './lib/router'
import type { Course, Material, StudyArtifact, StudyArtifactType, StudyFocus, StudyLevel, StudyPack, StudySession, TutorAnswer } from './types'
import { useAuth } from './auth/AuthContext'
import type { User } from '@supabase/supabase-js'
import { BrandLogo } from './BrandLogo'
import { FeedbackWidget } from './FeedbackWidget'
import { Dialog } from './Dialog'
import { Icon } from './Icon'
import { authErrorMessage } from './auth/authErrors'
import { useWorkspaces } from './hooks/useWorkspaces'
import { coursesInWorkspace, workspaceForCourse, GENERAL_WORKSPACE } from './lib/workspaces'
import { loadStudyActivity, saveStudyActivity, workspaceProgress, type MaterialActivity, type StudyActivity } from './lib/studyProgress'
import { WorkspaceSwitcher } from './WorkspaceSwitcher'
import { FoldersPage } from './FoldersPage'
import { ProgressPage } from './ProgressPage'

const AuthPage = lazy(() => import('./auth/AuthPage').then(module => ({ default: module.AuthPage })))
const AdminFeedbackPage = lazy(() => import('./AdminFeedbackPage').then(module => ({ default: module.AdminFeedbackPage })))
const CoursePracticePage = lazy(() => import('./CoursePracticePage').then(module => ({ default: module.CoursePracticePage })))

const ResolverPage = lazy(() => import('./ResolverPage').then(module => ({ default: module.ResolverPage })))
const CorrectorPage = lazy(() => import('./CorrectorPage').then(module => ({ default: module.CorrectorPage })))
const MaterialWorkspace = lazy(() => import('./MaterialWorkspace').then(module => ({ default: module.MaterialWorkspace })))
const CourseAiPage = lazy(() => import('./CourseAiPage').then(module => ({ default: module.CourseAiPage })))
const StudyMethodPage = lazy(() => import('./StudyMethodPage').then(module => ({ default: module.StudyMethodPage })))

type StudyMode = 'summary' | 'flashcards' | 'quiz' | 'tutor'

const uid = () => Math.random().toString(36).slice(2, 9)
const STORAGE_PREFIX = 'nexo-study-courses-v5:'
const LEGACY_KEYS = ['nexo-study-courses-v3', 'nexo-study-courses-v1']

function recoverInterruptedWork(courses: Course[]): Course[] {
  return courses.map(course => ({ ...course, materials: course.materials.map(material => ({
    ...material,
    processingStatus: material.sourceType === 'pdf' && (material.processingStatus === 'queued' || material.processingStatus === 'processing') ? 'failed' as const : material.processingStatus,
    processingStage: undefined,
    artifacts: material.artifacts?.map(artifact => artifact.status === 'queued' || artifact.status === 'processing'
      ? { ...artifact, status: 'failed' as const, errorMessage: 'La preparación se interrumpió. Puedes reintentarla.' } : artifact),
  })) }))
}

function withMinimumSummary(material: Material): Material {
  if (material.artifacts?.some(artifact => artifact.type === 'summary' && artifact.status === 'ready')) return material
  const topics = material.topics ?? []
  const summary = topics.slice(0, 5).map(topic => topic.summary.trim()).filter(Boolean).join(' ').slice(0, 1200)
  if (!summary) return material
  const now = new Date().toISOString()
  return { ...material, artifacts: [...(material.artifacts ?? []), {
    id: crypto.randomUUID(), type: 'summary', status: 'ready', payload: { summary },
    version: 1, sourceMaterialId: material.id, createdAt: now, updatedAt: now,
  }] }
}

function loadInitialCourses(userId: string): Course[] {
  try {
    const parseCourses = (value: string): Course[] | null => {
      const parsed: unknown = JSON.parse(value)
      return Array.isArray(parsed) && parsed.every(course =>
        course && typeof course.id === 'string' && typeof course.name === 'string' &&
        Array.isArray(course.materials) && course.materials.every((material: Material) =>
          material && typeof material.id === 'string' && typeof material.title === 'string' && typeof material.text === 'string'))
        ? parsed as Course[] : null
    }
    const ownKey = `${STORAGE_PREFIX}${userId}`
    const own = localStorage.getItem(ownKey)
    if (own) return recoverInterruptedWork(parseCourses(own) ?? demoCourses)
    const legacy = LEGACY_KEYS.map(key => localStorage.getItem(key)).find(Boolean)
    if (legacy) {
      const parsed = parseCourses(legacy)
      if (!parsed) return demoCourses
      localStorage.setItem(ownKey, legacy)
      LEGACY_KEYS.forEach(key => localStorage.removeItem(key))
      return recoverInterruptedWork(parsed)
    }
    return demoCourses
  } catch { return demoCourses }
}

function App() {
  const { loading, user, signOut, recovering } = useAuth()
  if (loading) return <div className="app-loading"><BrandLogo iconOnly/><strong>Cargando Nexo…</strong></div>
  if (!user || recovering) return <Suspense fallback={<div className="app-loading"><BrandLogo iconOnly/><strong>Cargando Nexo…</strong></div>}><AuthPage /></Suspense>
  if (window.location.pathname === '/nexo-ops/feedback-console') return <Suspense fallback={<div className="app-loading"><BrandLogo iconOnly/><strong>Cargando Nexo…</strong></div>}><AdminFeedbackPage /></Suspense>
  return <StudyApp key={user.id} user={user} signOut={signOut} />
}

function StudyApp({ user, signOut }: { user: User; signOut: () => Promise<void> }) {
  const [pathname, setPathname] = useState(window.location.pathname)
  const route = useMemo(() => parseAppRoute(pathname), [pathname])
  const tab = route.tab
  const [courses, setCourses] = useState<Course[]>(() => loadInitialCourses(user.id))
  const workspaces = useWorkspaces(user.id)
  const [activity, setActivity] = useState<StudyActivity>(() => loadStudyActivity(user.id))
  const [memory, setMemory] = useState<LearningMemory>(() => loadLearningMemory(user.id))
  const [sessions, setSessions] = useState<StudySession[]>(() => loadLocalSessions(user.id))
  const workspaceCourses = useMemo(() => coursesInWorkspace(courses, workspaces.memberships, workspaces.selectedId), [courses, workspaces.memberships, workspaces.selectedId])
  const [activeCourseId, setActiveCourseId] = useState(route.courseId || courses[0]?.id || '')
  const [activeMaterialId, setActiveMaterialId] = useState(route.materialId || courses[0]?.materials[0]?.id || '')
  const [showCourseForm, setShowCourseForm] = useState(false)
  const [courseBusy, setCourseBusy] = useState(false)
  const [courseError, setCourseError] = useState('')
  const [showMaterialForm, setShowMaterialForm] = useState(false)
  const [courseName, setCourseName] = useState('')
  const [courseEmoji, setCourseEmoji] = useState('📘')
  const [materialTitle, setMaterialTitle] = useState('')
  const [materialText, setMaterialText] = useState('')
  const [materialPages, setMaterialPages] = useState<Material['pages']>()
  const [sourceType, setSourceType] = useState<Material['sourceType']>('text')
  const [sourceName, setSourceName] = useState('')
  const [importStatus, setImportStatus] = useState('')
  const [studyMode, setStudyMode] = useState<StudyMode>('summary')
  const [flashIndex, setFlashIndex] = useState(0)
  const [flashRevealed, setFlashRevealed] = useState(false)
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>({})
  const [showAccountMenu, setShowAccountMenu] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('nexo-study-sidebar-collapsed') === 'true' }
    catch { return false }
  })
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [showWorkspaceDrawer, setShowWorkspaceDrawer] = useState(() => window.location.pathname === '/folders')
  const [signingOut, setSigningOut] = useState(false)
  const [accountError, setAccountError] = useState('')
  const [storageError, setStorageError] = useState('')
  const [syncError, setSyncError] = useState('')
  const [syncRetry, setSyncRetry] = useState(0)
  const [learningReady, setLearningReady] = useState(false)
  const [remoteEnabled, setRemoteEnabled] = useState(false)
  const accountRef = useRef<HTMLDivElement>(null)
  const sidebarRef = useRef<HTMLElement>(null)
  const mobileMenuRef = useRef<HTMLButtonElement>(null)
  const [aiGeneratingMaterialId, setAiGeneratingMaterialId] = useState<string | null>(null)
  const [aiGenerationErrors, setAiGenerationErrors] = useState<Record<string, string>>({})
  const [pdfFiles, setPdfFiles] = useState<Record<string, File>>({})
  const [sourceJump, setSourceJump] = useState<{ materialId: string; page: number } | null>(null)
  const remoteQueueRef = useRef<Promise<void>>(Promise.resolve())
  const savedRemoteSnapshotRef = useRef<Record<'courses' | 'activity' | 'memory' | 'sessions', string>>({
    courses: '', activity: '', memory: '', sessions: '',
  })

  useEffect(() => {
    if (remoteEnabled) return
    let live = true
    void synchronizeCourses(user.id, loadInitialCourses(user.id)).then(result => {
      if (!live) return
      setCourses(current => {
        const restored = recoverInterruptedWork(result.courses)
        const remoteIds = new Set(restored.map(course => course.id))
        return [...restored.map(course => {
          const existing = current.find(item => item.id === course.id)
          const materialIds = new Set(course.materials.map(item => item.id))
          return existing ? { ...course, materials: [...course.materials, ...existing.materials.filter(item => !materialIds.has(item.id))] } : course
        }), ...current.filter(course => !remoteIds.has(course.id))]
      })
      setActivity(current => ({ ...result.activity, ...current }))
      setMemory(current => ({ ...result.memory, ...current }))
      setSessions(current => {
        const localIds = new Set(current.map(session => session.id))
        return [...current, ...result.sessions.filter(session => !localIds.has(session.id))]
      })
      setRemoteEnabled(true)
      setSyncError('')
    }).catch(() => {
      if (live) setSyncError('Tus cursos siguen en este navegador. No pudimos sincronizarlos con tu cuenta; vuelve a intentarlo más tarde.')
    }).finally(() => { if (live) setLearningReady(true) })
    return () => { live = false }
  }, [user.id, remoteEnabled, syncRetry])

  useEffect(() => {
    if (!learningReady || !remoteEnabled) return
    const snapshot = {
      courses: JSON.stringify(courses), activity: JSON.stringify(activity),
      memory: JSON.stringify(memory), sessions: JSON.stringify(sessions),
    }
    const timer = window.setTimeout(() => {
      remoteQueueRef.current = remoteQueueRef.current.catch(() => {}).then(async () => {
        if (snapshot.courses !== savedRemoteSnapshotRef.current.courses) {
          await saveCourses(user.id, courses)
          savedRemoteSnapshotRef.current.courses = snapshot.courses
        }
        if (snapshot.activity !== savedRemoteSnapshotRef.current.activity) {
          await saveActivity(user.id, courses, activity)
          savedRemoteSnapshotRef.current.activity = snapshot.activity
        }
        if (snapshot.memory !== savedRemoteSnapshotRef.current.memory) {
          await saveLearningState(user.id, courses, memory)
          savedRemoteSnapshotRef.current.memory = snapshot.memory
        }
        if (snapshot.sessions !== savedRemoteSnapshotRef.current.sessions) {
          await saveSessions(user.id, sessions)
          savedRemoteSnapshotRef.current.sessions = snapshot.sessions
        }
        setSyncError('')
      }).catch(() => setSyncError('No pudimos sincronizar los últimos cambios. Permanecen guardados en este navegador.'))
    }, 500)
    return () => window.clearTimeout(timer)
  }, [user.id, courses, activity, memory, sessions, learningReady, remoteEnabled, syncRetry])

  const retrySynchronization = () => {
    savedRemoteSnapshotRef.current = { courses: '', activity: '', memory: '', sessions: '' }
    setSyncError('')
    setSyncRetry(value => value + 1)
  }

  useEffect(() => {
    const onPopState = () => { setPathname(window.location.pathname); setShowAccountMenu(false) }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const navigate = (path: string, replace = false) => {
    setShowAccountMenu(false)
    setMobileSidebarOpen(false)
    if (window.location.pathname === path) return
    window.history[replace ? 'replaceState' : 'pushState']({}, '', path)
    setPathname(path)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const setTab = (next: AppTab) => navigate(tabPath(next))

  useEffect(() => {
    try { localStorage.setItem('nexo-study-sidebar-collapsed', String(sidebarCollapsed)) }
    catch { /* Navigation remains available when storage is disabled. */ }
  }, [sidebarCollapsed])

  useEffect(() => {
    if (!mobileSidebarOpen) return
    sidebarRef.current?.querySelector<HTMLButtonElement>('.sidebar-mobile-close')?.focus()
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setMobileSidebarOpen(false); mobileMenuRef.current?.focus() }
      if (event.key === 'Tab' && sidebarRef.current) {
        const focusable = Array.from(sidebarRef.current.querySelectorAll<HTMLButtonElement>('button:not([disabled])')).filter(button => button.offsetParent !== null)
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (!first || !last) return
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [mobileSidebarOpen])

  useEffect(() => {
    if (pathname === '/folders') { setShowWorkspaceDrawer(true); navigate('/courses', true) }
    else if (pathname === '/study') navigate('/courses', true)
  }, [pathname])

  useEffect(() => {
    try { localStorage.setItem(`${STORAGE_PREFIX}${user.id}`, JSON.stringify(courses)); setStorageError('') }
    catch { setStorageError('El almacenamiento de este navegador está lleno o no está disponible. Los cambios de esta sesión podrían perderse al cerrar la página.') }
  }, [courses, user.id])

  useEffect(() => {
    try { saveStudyActivity(user.id, activity) }
    catch { setStorageError('No pudimos guardar tu progreso en este navegador. Libera espacio de almacenamiento y vuelve a intentarlo.') }
  }, [activity, user.id])

  useEffect(() => {
    try { saveLearningMemory(user.id, memory) }
    catch { setStorageError('No pudimos guardar tu progreso en este navegador. Libera espacio y vuelve a intentarlo.') }
  }, [memory, user.id])

  useEffect(() => {
    try { saveLocalSessions(user.id, sessions) }
    catch { setStorageError('No pudimos guardar tus sesiones en este navegador.') }
  }, [sessions, user.id])

  const recordActivity = useCallback((materialId: string, updater: (value: MaterialActivity) => MaterialActivity) => {
    setActivity(current => ({ ...current, [materialId]: { ...updater(current[materialId] ?? {}), lastStudiedAt: new Date().toISOString() } }))
  }, [])
  const recordRecall = useCallback((materialId: string, label: string, rating: RecallRating) => {
    setMemory(current => applyRecall(current, materialId, label, rating))
  }, [])

  const prepareSession = (course: Course, minutes: SessionDuration, objective: SessionObjective) => {
    const active = sessions.find(session => session.courseId === course.id && session.status !== 'completed')
    if (active) return active
    const session = buildStudySession(course, activity, memory, minutes, objective)
    setSessions(current => [session, ...current])
    return session
  }
  const completePracticeStep = (sessionId: string, step: number) => {
    const session = sessions.find(item => item.id === sessionId)
    if (!session || session.results[String(step)] === 1) return
    const materialId = session.plan[step]?.materialId
    setSessions(current => current.map(item => item.id === sessionId ? completeSessionStep(item, step) : item))
    if (materialId) recordActivity(materialId, value => ({ ...value,
      sessionSteps: [...new Set([...(value.sessionSteps ?? []), `${sessionId}:${step}`])],
    }))
  }

  useEffect(() => {
    if (!showAccountMenu) return
    const dismiss = (event: PointerEvent) => { if (!accountRef.current?.contains(event.target as Node)) setShowAccountMenu(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setShowAccountMenu(false); accountRef.current?.querySelector('button')?.focus() } }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', escape) }
  }, [showAccountMenu])

  const logout = async () => {
    setSigningOut(true); setAccountError('')
    try { await signOut() } catch (error) { setAccountError(authErrorMessage(error)) }
    finally { setSigningOut(false) }
  }

  useEffect(() => {
    if (route.courseId) setActiveCourseId(route.courseId)
    if (route.materialId) setActiveMaterialId(route.materialId)
  }, [route.courseId, route.materialId])

  useEffect(() => {
    if (!route.materialStudyMode) return
    const legacyMode: Record<MaterialStudyMode, StudyMode> = {
      learn: 'tutor', flashcards: 'flashcards', 'multiple-choice': 'quiz', written: 'tutor',
      'fill-blanks': 'quiz', notes: 'summary', exam: 'quiz',
    }
    setStudyMode(legacyMode[route.materialStudyMode])
  }, [route.materialStudyMode])

  useEffect(() => {
    if (!workspaces.ready || !route.courseId) return
    const owner = workspaceForCourse(route.courseId, workspaces.memberships)
    if (courses.some(course => course.id === route.courseId) && workspaces.selectedId !== owner) workspaces.setSelectedId(owner)
  }, [route.courseId, courses, workspaces.ready, workspaces.memberships, workspaces.selectedId])

  const selectedCourse = workspaceCourses.find(course => course.id === activeCourseId)
  const activeCourse = route.courseId ? workspaceCourses.find(course => course.id === route.courseId) : (selectedCourse ?? workspaceCourses[0])
  const activeMaterial = activeCourse
    ? (route.materialId ? activeCourse.materials.find(material => material.id === route.materialId) : (activeCourse.materials.find(material => material.id === activeMaterialId) ?? activeCourse.materials[0]))
    : undefined

  useEffect(() => { setQuizAnswers({}); setFlashIndex(0); setFlashRevealed(false) }, [activeMaterial?.id])

  useEffect(() => {
    if (route.materialId && studyMode === 'summary' && activeMaterial && !activity[activeMaterial.id]?.summaryViewed) {
      recordActivity(activeMaterial.id, value => ({ ...value, summaryViewed: true }))
    }
  }, [route.materialId, studyMode, activeMaterial?.id, activity, recordActivity])

  useEffect(() => {
    if (!activeCourse) return
    if (!activeCourse.materials.some(material => material.id === activeMaterialId)) setActiveMaterialId(activeCourse.materials[0]?.id ?? '')
  }, [activeCourseId, activeCourse, activeMaterialId])

  const pack: StudyPack | null = useMemo(() => {
    if (!activeMaterial?.text) return null
    const fallback = activeMaterial.studyPack || generateStudyPack(activeMaterial.text, 10)
    const cards = activeMaterial.artifacts?.filter(item => item.type === 'flashcards' && item.status === 'ready').sort((a, b) => b.version - a.version)[0]
    const questions = activeMaterial.artifacts?.filter(item => item.type === 'multiple_choice' && item.status === 'ready').sort((a, b) => b.version - a.version)[0]
    return { ...fallback, flashcards: cards ? artifactFlashcards(cards.payload) : fallback.flashcards,
      quiz: questions ? artifactQuestions(questions.payload) : fallback.quiz }
  }, [activeMaterial])
  const flashArtifact = activeMaterial?.artifacts?.filter(item => item.type === 'flashcards').sort((a, b) => b.version - a.version)[0]
  const quizArtifact = activeMaterial?.artifacts?.filter(item => item.type === 'multiple_choice').sort((a, b) => b.version - a.version)[0]
  const totalMaterials = workspaceCourses.reduce((acc, course) => acc + course.materials.length, 0)
  const aiPreparedMaterials = workspaceCourses.reduce((acc, course) => acc + course.materials.filter(m => m.studyPackMeta?.source === 'nexo-ai').length, 0)
  const currentProgress = workspaceProgress(workspaceCourses, activity)

  const resetStudy = () => { setQuizAnswers({}); setFlashIndex(0); setFlashRevealed(false) }

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

  const addCourse = async () => {
    const name = courseName.trim(); if (!name || courseBusy) return
    const course: Course = { id: `course-${uid()}`, name, emoji: courseEmoji, materials: [] }
    setCourseBusy(true); setCourseError('')
    try {
      if (workspaces.selectedId !== GENERAL_WORKSPACE) await workspaces.moveCourse(course.id, workspaces.selectedId)
    } catch (error) {
      setCourseError(error instanceof Error ? error.message : 'No pudimos crear el curso en este espacio.')
      setCourseBusy(false)
      return
    }
    setCourses(prev => [...prev, course])
    setActiveCourseId(course.id)
    setCourseName(''); setCourseEmoji('📘'); setShowCourseForm(false)
    setCourseBusy(false)
    navigate(coursePath(course.id))
  }

  const resetMaterialForm = () => {
    setMaterialTitle(''); setMaterialText(''); setMaterialPages(undefined); setSourceType('text'); setSourceName(''); setImportStatus('')
  }

  const addMaterial = async () => {
    if (!activeCourse || !materialTitle.trim() || !materialText.trim()) return
    const baseMaterial: Material = {
      id: `mat-${uid()}`,
      title: materialTitle.trim(),
      text: materialText.trim(),
      createdAt: new Date().toISOString(),
      sourceType,
      sourceName: sourceName || undefined,
      pages: materialPages,
      pageCount: materialPages?.length,
      processingStatus: 'ready',
    }
    const chunks = chunksForMaterial(baseMaterial)
    const material = withMinimumSummary({ ...baseMaterial, chunks, topics: topicsForMaterial(baseMaterial, chunks) })
    const courseId = activeCourse.id
    setCourses(prev => prev.map(course => course.id === courseId ? { ...course, materials: [...course.materials, material] } : course))
    setActiveMaterialId(material.id)
    resetStudy()
    setShowMaterialForm(false)
    resetMaterialForm()
    navigate(materialPath(courseId, material.id))
    if (remoteEnabled) void (async () => {
      try {
        await saveCourses(user.id, [{ ...activeCourse, materials: [...activeCourse.materials, material] }])
        await saveMaterialContext(user.id, courseId, material)
        for (const artifact of material.artifacts ?? []) await saveArtifact(user.id, courseId, artifact)
      } catch {
        setSyncError('El material está disponible aquí, pero no pudimos sincronizarlo con tu cuenta. Comprueba la conexión y vuelve a intentarlo.')
      }
    })()
  }

  const processPdfMaterial = (course: Course, material: Material, file: File) => {
    setSyncError('')
    void (async () => {
      let uploadedPath = material.storagePath
      const upload = remoteEnabled ? (async () => {
        try {
          await saveCourses(user.id, [{ ...course, materials: [material] }])
          const storagePath = await uploadPrivatePdf(user.id, course.id, material.id, file)
          uploadedPath = storagePath
          updateMaterial(course.id, material.id, current => ({ ...current, storagePath }))
        } catch { setSyncError('El PDF está disponible en esta sesión, pero no pudimos guardarlo en tu cuenta. Revisa la conexión y vuelve a intentarlo.') }
      })() : Promise.resolve()
      try {
        updateMaterial(course.id, material.id, current => ({ ...current, processingStatus: 'processing', processingStage: 'reading' }))
        const extracted = await extractPdf(file)
        updateMaterial(course.id, material.id, current => ({ ...current, processingStage: 'indexing', pageCount: extracted.pages.length }))
        const withText: Material = { ...material, text: extracted.text, pages: extracted.pages, pageCount: extracted.pages.length, processingStatus: 'processing', processingStage: 'indexing' }
        const chunks = chunksForMaterial(withText)
        const ready = withMinimumSummary({ ...withText, chunks, topics: topicsForMaterial(withText, chunks), processingStatus: 'ready', processingStage: undefined })
        updateMaterial(course.id, material.id, current => ({ ...current, ...ready, storagePath: current.storagePath ?? uploadedPath }))
        await upload
        if (remoteEnabled) {
          try {
            await saveCourses(user.id, [{ ...course, materials: [{ ...ready, storagePath: uploadedPath }] }])
            await saveMaterialContext(user.id, course.id, ready)
            for (const artifact of ready.artifacts ?? []) if (artifact.type === 'summary') await saveArtifact(user.id, course.id, artifact)
          } catch { setSyncError('El material se leyó, pero la sincronización de sus temas está pendiente. Conservamos una copia en este navegador.') }
        }
      } catch (error) {
        updateMaterial(course.id, material.id, current => ({ ...current, processingStatus: 'failed', processingStage: undefined }))
        setSyncError(error instanceof Error && /^(Este PDF supera|No encontré texto seleccionable)/.test(error.message)
          ? error.message : 'No pudimos leer este PDF. Comprueba que el archivo sea válido y vuelve a intentarlo.')
      }
    })()
  }

  const retryPdfMaterial = async (course: Course, material: Material) => {
    let file = pdfFiles[material.id]
    if (!file && material.storagePath) {
      try {
        const url = await signedPdfUrl(material.storagePath)
        const response = await fetch(url)
        if (!response.ok) throw new Error('PDF no disponible')
        const blob = await response.blob()
        if (blob.size > MAX_PDF_BYTES) throw new Error('PDF demasiado grande')
        const restoredFile = new File([blob], material.sourceName || `${material.title}.pdf`, { type: 'application/pdf' })
        file = restoredFile
        setPdfFiles(current => ({ ...current, [material.id]: restoredFile }))
      } catch {
        setSyncError('No pudimos volver a abrir este PDF. Comprueba la conexión o súbelo de nuevo.')
        return
      }
    }
    if (file) processPdfMaterial(course, material, file)
  }

  const importFile = async (file?: File) => {
    if (!file) return
    if (/\.pdf$/i.test(file.name)) {
      if (!activeCourse) { setImportStatus('⚠ Primero abre un curso para agregar el PDF.'); return }
      if (file.size > MAX_PDF_BYTES) { setImportStatus('⚠ Este PDF supera 25 MB. Divide el documento y vuelve a subirlo.'); return }
      const course = activeCourse
      const material: Material = {
        id: `mat-${uid()}`, title: file.name.replace(/\.pdf$/i, ''), text: '',
        createdAt: new Date().toISOString(), sourceType: 'pdf', sourceName: file.name,
        processingStatus: 'queued', processingStage: 'reading',
      }
      setPdfFiles(current => ({ ...current, [material.id]: file }))
      setCourses(current => current.map(item => item.id === course.id ? { ...item, materials: [...item.materials, material] } : item))
      setActiveMaterialId(material.id)
      setShowMaterialForm(false)
      resetMaterialForm()
      navigate(materialWorkspacePath(course.id, material.id))

      processPdfMaterial(course, material, file)
      return
    }
    setMaterialTitle(file.name.replace(/\.(txt|md|pdf)$/i, ''))
    setSourceName(file.name)
    setImportStatus('Leyendo archivo…')
    try {
      if (/\.(txt|md)$/i.test(file.name)) {
        setMaterialText(await file.text()); setMaterialPages(undefined); setSourceType('text'); setImportStatus('✓ Texto importado correctamente')
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
    const material = courses.find(course => course.id === courseId)?.materials.find(item => item.id === materialId)
    setSourceJump(null)
    setActiveCourseId(courseId); setActiveMaterialId(materialId); resetStudy()
    navigate(material?.sourceType === 'pdf' ? materialWorkspacePath(courseId, materialId) : materialPath(courseId, materialId))
  }

  const switchWorkspace = (id: string) => {
    workspaces.setSelectedId(id)
    setActiveCourseId(''); setActiveMaterialId(''); resetStudy()
    navigate('/courses')
  }

  const regenerateActiveMaterial = () => {
    if (!activeCourse || !activeMaterial) return
    const focus = activeMaterial.studyPackMeta?.focus || 'balanced'
    const level = activeMaterial.studyPackMeta?.level || 'university'
    void prepareMaterialWithAI(activeCourse.id, activeCourse.name, activeMaterial, focus, level)
  }

  const generateArtifact = (type: Exclude<StudyArtifactType, 'summary' | 'exam'>, force = false) => {
    if (!activeCourse || !activeMaterial || !activeMaterial.text) return
    const course = activeCourse
    const material = activeMaterial
    const previous = material.artifacts?.filter(item => item.type === type).sort((a, b) => b.version - a.version)[0]
    if (!force && (previous?.status === 'ready' || previous?.status === 'processing')) return
    const now = new Date().toISOString()
    const artifact: StudyArtifact = {
      id: force || !previous ? crypto.randomUUID() : previous.id, type, status: 'processing', payload: {},
      version: force ? (previous?.version ?? 0) + 1 : previous?.version ?? 1,
      sourceMaterialId: material.id, createdAt: force || !previous ? now : previous.createdAt, updatedAt: now,
    }
    const replaceArtifact = (next: StudyArtifact) => updateMaterial(course.id, material.id, current => ({
      ...current, artifacts: [...(current.artifacts ?? []).filter(item => item.id !== next.id), next],
    }))
    replaceArtifact(artifact)
    void (async () => {
      try {
        if (remoteEnabled) await saveArtifact(user.id, course.id, artifact).catch(() => setSyncError('La actividad sigue disponible aquí, pero no pudimos sincronizarla con tu cuenta.'))
        const payload = await generateArtifactWithAI(course.id, course.name, material, type)
        const readyArtifact: StudyArtifact = { ...artifact, payload, status: 'ready', updatedAt: new Date().toISOString() }
        replaceArtifact(readyArtifact)
        if (remoteEnabled) await saveArtifact(user.id, course.id, readyArtifact).catch(() => setSyncError('La actividad está lista, pero no pudimos sincronizarla con tu cuenta.'))
      } catch {
        const failed: StudyArtifact = { ...artifact, status: 'failed', errorMessage: 'Nexo tuvo un problema preparando esta actividad.', updatedAt: new Date().toISOString() }
        replaceArtifact(failed)
        if (remoteEnabled) void saveArtifact(user.id, course.id, failed).catch(() => setSyncError('No pudimos sincronizar esta actividad; permanece en este navegador.'))
      }
    })()
  }

  const topTitle = route.materialId ? 'Estudiar' : route.courseId ? 'Curso' : tabTitle(tab)

  if (!workspaces.ready || !learningReady) return <div className="app-loading workspace-loading"><BrandLogo iconOnly/><strong>{!learningReady ? 'Preparando tu espacio de aprendizaje…' : workspaces.loading ? 'Cargando tus espacios…' : 'No pudimos cargar tus espacios'}</strong>{workspaces.error && learningReady && <><p>{workspaces.error}</p><button className="primary" onClick={() => workspaces.refresh()}>Reintentar</button></>}</div>

  return (
    <div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''} ${mobileSidebarOpen ? 'mobile-sidebar-open' : ''}`}>
      <a href="#main-content" className="skip-link">Saltar al contenido</a>
      {mobileSidebarOpen && <button className="mobile-sidebar-backdrop" aria-label="Cerrar navegación" onClick={() => { setMobileSidebarOpen(false); mobileMenuRef.current?.focus() }}/>}
      <aside ref={sidebarRef} className="sidebar" role={mobileSidebarOpen ? 'dialog' : undefined} aria-modal={mobileSidebarOpen || undefined} aria-label="Barra lateral principal">
        <div className="sidebar-top"><button className="brand" onClick={() => setTab('inicio')} aria-label="Ir al inicio"><BrandLogo compact/></button><button className="sidebar-collapse-toggle" aria-label={sidebarCollapsed ? 'Expandir barra lateral' : 'Colapsar barra lateral'} aria-expanded={!sidebarCollapsed} onClick={() => setSidebarCollapsed(value => !value)}><Icon name={sidebarCollapsed ? 'expand' : 'collapse'}/></button><button className="sidebar-mobile-close" aria-label="Cerrar navegación" onClick={() => { setMobileSidebarOpen(false); mobileMenuRef.current?.focus() }}><Icon name="close"/></button></div>
        <nav aria-label="Navegación principal">
          <NavButton icon="⌂" label="Inicio" active={tab === 'inicio'} onClick={() => setTab('inicio')} />
          <NavButton icon="▦" label="Mis cursos" active={tab === 'cursos'} onClick={() => setTab('cursos')} />
          <NavButton icon="⌁" label="Resolver" active={tab === 'resolver'} onClick={() => setTab('resolver')} />
          <NavButton icon="✎" label="Corrector" active={tab === 'corrector'} onClick={() => setTab('corrector')} />
          <NavButton icon="↗" label="Progreso" active={tab === 'progreso'} onClick={() => setTab('progreso')} />
        </nav>
        <button className="sidebar-profile" aria-label="Abrir perfil" onClick={() => { setMobileSidebarOpen(false); setShowAccountMenu(true); accountRef.current?.querySelector('button')?.focus() }}><span>{(user.user_metadata?.full_name || user.email || 'N').trim().charAt(0).toUpperCase()}</span><strong>{user.user_metadata?.full_name || 'Mi cuenta'}</strong></button>
      </aside>

      <WorkspaceSwitcher selected={workspaces.selectedWorkspace} open={showWorkspaceDrawer} onOpenChange={setShowWorkspaceDrawer}>
        {showWorkspaceDrawer && <FoldersPage allCourses={courses} folders={workspaces.folders} memberships={workspaces.memberships} selected={workspaces.selectedWorkspace} activity={activity} onSelect={switchWorkspace} onCreate={async (name, emoji) => { const created = await workspaces.createWorkspace(name, emoji); navigate('/courses'); return created }} onMove={workspaces.moveCourse} onDelete={workspaces.deleteWorkspace} onOpenCourse={id => { setShowWorkspaceDrawer(false); openCourse(id) }} />}
      </WorkspaceSwitcher>

      <main className="main-content" id="main-content" tabIndex={-1}>
        <header className="topbar"><button ref={mobileMenuRef} className="mobile-menu-toggle" aria-label="Abrir navegación" aria-expanded={mobileSidebarOpen} onClick={() => setMobileSidebarOpen(true)}><Icon name="more"/></button><div><p className="eyebrow">Nexo Study</p><h1>{topTitle}</h1></div><div className="top-actions"><div className="ai-chip"><span className="status-dot"></span><strong>Nexo IA</strong></div><div className="account-wrap" ref={accountRef}><button className="avatar" aria-label="Mi cuenta" aria-expanded={showAccountMenu} aria-controls="account-menu" onClick={() => setShowAccountMenu(value => !value)}>{(user.user_metadata?.full_name || user.email || 'N').trim().charAt(0).toUpperCase()}</button>{showAccountMenu && <div className="account-menu" id="account-menu"><strong>{user.user_metadata?.full_name || 'Estudiante Nexo'}</strong><span>{user.email}</span><button disabled={signingOut} onClick={logout}>{signingOut ? 'Cerrando sesión…' : 'Cerrar sesión'}</button>{accountError && <p role="alert" className="auth-alert error">{accountError}</p>}</div>}</div></div></header>
        {workspaces.error && <div role="status" className="workspace-warning">{workspaces.error} Estás viendo la última organización guardada. <button onClick={() => workspaces.refresh()}>Reintentar</button></div>}
        {storageError && <p role="alert" className="auth-alert error">{storageError}</p>}
        {syncError && <p role="status" className="workspace-warning">{syncError} <button onClick={retrySynchronization}>Reintentar sincronización</button></p>}

        <Suspense fallback={<div className="app-loading"><BrandLogo iconOnly/><strong>Abriendo tu espacio…</strong></div>}>

        {(route.courseId || route.materialId) && <div className="route-breadcrumbs"><button onClick={() => navigate('/courses')}>Cursos</button>{activeCourse && <><span>›</span><button onClick={() => navigate(coursePath(activeCourse.id))}>{activeCourse.emoji} {activeCourse.name}</button></>}{route.materialId && activeMaterial && <><span>›</span><strong>{activeMaterial.title}</strong></>}</div>}

        {tab === 'inicio' && <section className="page-grid home-page">
          <div className="hero-card"><div><span className="pill">✦ Tu material. Tu manera de aprender.</span><h2>De tus apuntes a tu próximo <em>logro.</em></h2><p>Sube un PDF y encuentra claridad. Resúmenes, flashcards y preguntas para avanzar a tu ritmo.</p><div className="hero-actions"><button className="primary" onClick={() => activeCourse ? setShowMaterialForm(true) : setShowCourseForm(true)}>＋ Subir material</button><button className="secondary" onClick={() => setTab('cursos')}>Ver mis cursos ↗</button></div><div className="hero-caption">ORGANIZA <span>·</span> COMPRENDE <span>·</span> PRACTICA</div></div><div className="hero-study-art" aria-hidden="true"><div className="art-orbit"/><div className="art-sheet art-sheet-back"/><div className="art-sheet"><span>✦ NEXO STUDY</span><h3>Todo empieza<br/>con una idea.</h3><i/><i/><i/><div><b>✓</b> Lista para aprender</div></div><div className="art-tag">✦ De PDF a posibilidades</div></div></div>
          <div className="stats-grid"><Stat label="Cursos" value={`${workspaceCourses.length}`} hint="en este espacio"/><Stat label="Materiales" value={`${totalMaterials}`} hint="guardados"/><Stat label="PDF preparados" value={`${aiPreparedMaterials}`} hint="con Nexo IA"/><Stat label="Avance" value={`${currentProgress.percent}%`} hint="de este espacio"/></div>
          <section className="panel wide home-courses"><div className="section-head"><div><p className="eyebrow">{workspaces.selectedWorkspace.emoji} {workspaces.selectedWorkspace.name}</p><h3>Tus cursos</h3></div><button className="text-button" onClick={() => setShowCourseForm(true)}>+ Nuevo curso</button></div>{workspaceCourses.length ? <div className="course-row">{workspaceCourses.map(course => <button className="course-mini" key={course.id} onClick={() => openCourse(course.id)}><span>{course.emoji}</span><div><strong>{course.name}</strong><small>{course.materials.length} materiales</small></div><b>›</b></button>)}</div> : <div className="workspace-home-empty"><p>Este espacio todavía no tiene cursos. Usa la pestaña del borde derecho para traer uno.</p></div>}</section>
        </section>}

        {tab === 'cursos' && !route.courseId && <section className="course-library-page">
          <div className="library-intro"><div><p className="eyebrow">Biblioteca · {workspaces.selectedWorkspace.emoji} {workspaces.selectedWorkspace.name}</p><h2>Mis cursos</h2><p>Abre un curso para estudiar sus materiales.</p></div><button className="primary" onClick={() => setShowCourseForm(true)}>+ Nuevo curso</button></div>
          {workspaceCourses.length ? <div className="course-library-grid">{workspaceCourses.map(course => <button className="course-library-card" key={course.id} onClick={() => openCourse(course.id)}><span>{course.emoji}</span><div><strong>{course.name}</strong><small>{course.materials.length} materiales{course.materials.length ? ` · ${workspaceProgress([course], activity).percent}% de avance` : ''}</small></div><b>Entrar →</b></button>)}</div> : <EmptyState title="Aún no hay cursos aquí" text="Crea uno nuevo o usa la pestaña del borde derecho para traer uno de otro espacio." />}
        </section>}

        {tab === 'cursos' && route.courseId && !route.materialId && <section className="course-page">
          {activeCourse ? <>
            <div className="course-page-hero"><div className="course-page-emoji">{activeCourse.emoji}</div><div><p className="eyebrow">Curso</p><h2>{activeCourse.name}</h2><p>{activeCourse.materials.length} materiales · Cada documento tiene su espacio de aprendizaje.</p></div><button className="primary" onClick={() => setShowMaterialForm(true)}>+ Agregar material</button></div>
            <nav className="course-context-nav" aria-label={`Secciones de ${activeCourse.name}`}>{([
              ['overview', 'Resumen'], ['materials', 'Materiales'], ['ai', 'Nexo IA'], ['library', 'Biblioteca'], ['practice', 'Práctica'], ['progress', 'Progreso'],
            ] as [CourseSection, string][]).map(([section, label]) => <button key={section} className={(route.courseSection ?? 'overview') === section ? 'active' : ''} aria-current={(route.courseSection ?? 'overview') === section ? 'page' : undefined} onClick={() => navigate(courseSectionPath(activeCourse.id, section))}>{label}</button>)}</nav>
            {(route.courseSection === undefined || route.courseSection === 'overview') && <div className="course-overview"><div className="course-overview-main"><p className="eyebrow">Continuar estudiando</p><h3>{activeCourse.materials.length ? activeCourse.materials[activeCourse.materials.length - 1].title : 'Tu primer material'}</h3><p>{activeCourse.materials.length ? 'Retoma el documento y decide cómo avanzar con Nexo.' : 'Agrega un PDF o tus apuntes para empezar.'}</p><button className="primary" onClick={() => activeCourse.materials.length ? openMaterial(activeCourse.id, activeCourse.materials[activeCourse.materials.length - 1].id) : setShowMaterialForm(true)}>{activeCourse.materials.length ? 'Continuar →' : 'Agregar material'}</button></div><div className="course-overview-side"><strong>{workspaceProgress([activeCourse], activity).percent}% de actividad</strong><p>Dominio estimado: {masterySummary(memory, activeCourse.materials.map(item => item.id)).percent}% · {masterySummary(memory, activeCourse.materials.map(item => item.id)).weak.length} conceptos por repasar</p><div className="course-overview-actions"><button className="secondary" onClick={() => navigate(courseSectionPath(activeCourse.id, 'practice'))}>Preparar sesión →</button><button className="text-button" onClick={() => navigate(courseSectionPath(activeCourse.id, 'ai'))}>Preguntar a Nexo →</button></div></div></div>}
            {(route.courseSection === undefined || route.courseSection === 'overview' || route.courseSection === 'materials') && (activeCourse.materials.length ? <div className="materials-grid course-materials-grid">{activeCourse.materials.map(material => <button className="material-card" key={material.id} onClick={() => openMaterial(activeCourse.id, material.id)}><div className="material-meta"><span className="file-icon">{material.sourceType === 'pdf' ? 'PDF' : '≡'}</span>{material.pages?.length ? <span className="source-badge">{material.pages.length} págs.</span> : null}{material.studyPackMeta?.source === 'nexo-ai' && <span className="ai-ready-badge">✦ IA lista</span>}</div><strong>{material.title}</strong><p>{material.processingStatus === 'processing' ? 'Nexo está leyendo este documento…' : material.text.replace(/\[Página \d+\]/g, '').slice(0, 125)}{material.text.length > 125 ? '…' : ''}</p><small>Estudiar material →</small></button>)}</div> : <EmptyState title="Todavía no hay materiales" text="Sube un PDF para abrirlo junto a Nexo y elegir cómo estudiar." action="Agregar material" onClick={() => setShowMaterialForm(true)} />)}
            {route.courseSection === 'ai' && <CourseAiPage key={activeCourse.id} course={activeCourse} memory={memory} activity={activity} onOpenSource={(materialId, page) => { openMaterial(activeCourse.id, materialId); setSourceJump({ materialId, page }) }}/>}
            {route.courseSection === 'library' && <div className="course-artifact-library"><div className="section-head"><div><p className="eyebrow">Creado con tus materiales</p><h3>Biblioteca generada</h3></div></div>{activeCourse.materials.map(material => {
              const readyArtifacts = (material.artifacts ?? []).filter(item => item.status === 'ready')
                .filter(item => !(material.artifacts ?? []).some(other => other.type === item.type && other.status === 'ready' && other.version > item.version))
              const artifactLabels: Partial<Record<StudyArtifactType, string>> = { summary: 'Resumen', flashcards: 'Flashcards', multiple_choice: 'Opción múltiple', written_questions: 'Preguntas escritas', fill_blanks: 'Completar espacios', notes: 'Apuntes', exam: 'Simulacro' }
              const artifactModes: Partial<Record<StudyArtifactType, MaterialStudyMode>> = { flashcards: 'flashcards', multiple_choice: 'multiple-choice', written_questions: 'written', fill_blanks: 'fill-blanks', notes: 'notes', exam: 'exam' }
              return <section className="course-artifact-group" key={material.id}><div><h4>{material.title}</h4><p>{readyArtifacts.length ? `${readyArtifacts.length} recursos listos` : 'Prepara recursos desde este material cuando los necesites.'}</p></div><div className="course-artifact-links">{readyArtifacts.map(artifact => <button key={artifact.id} className="secondary" onClick={() => { const mode = artifactModes[artifact.type]; navigate(mode ? materialStudyPath(activeCourse.id, material.id, mode) : materialPath(activeCourse.id, material.id)) }}>{artifactLabels[artifact.type]} →</button>)}<button className="text-button" onClick={() => openMaterial(activeCourse.id, material.id)}>{readyArtifacts.length ? 'Abrir material' : 'Abrir y preparar →'}</button></div></section>
            })}{!activeCourse.materials.length && <div className="course-section-empty"><p>Agrega un material para preparar tus primeros recursos.</p><button className="primary" onClick={() => setShowMaterialForm(true)}>Agregar material</button></div>}</div>}
            {route.courseSection === 'practice' && <CoursePracticePage course={activeCourse} sessions={sessions.filter(session => session.courseId === activeCourse.id)} onPrepare={(minutes, objective) => prepareSession(activeCourse, minutes, objective)} onComplete={completePracticeStep} onOpenActivity={(materialId, mode) => navigate(materialStudyPath(activeCourse.id, materialId, mode))}/>}
            {route.courseSection === 'progress' && <ProgressPage workspace={{ id: activeCourse.id, name: activeCourse.name, emoji: activeCourse.emoji, created_at: '' }} courses={[activeCourse]} activity={activity} memory={memory} sessions={sessions.filter(session => session.courseId === activeCourse.id)} onOpenMaterial={openMaterial} />}
          </> : <EmptyState title="Curso no encontrado" text="Este curso no existe en este dispositivo." action="Volver a cursos" onClick={() => navigate('/courses')} />}
        </section>}

        {tab === 'resolver' && <ResolverPage key={workspaces.selectedId} workspaceId={workspaces.selectedId} feedback={<FeedbackWidget context={pathname} inline />} />}
        {tab === 'corrector' && <CorrectorPage key={workspaces.selectedId} />}

        {tab === 'cursos' && route.workspace && activeCourse && activeMaterial && <MaterialWorkspace key={activeMaterial.id} course={activeCourse} material={activeMaterial} localPdf={pdfFiles[activeMaterial.id]} initialPage={sourceJump?.materialId === activeMaterial.id ? sourceJump.page : undefined} onBack={() => navigate(coursePath(activeCourse.id))} onStudy={mode => navigate(materialStudyPath(activeCourse.id, activeMaterial.id, mode))} onRetry={pdfFiles[activeMaterial.id] || activeMaterial.storagePath ? () => void retryPdfMaterial(activeCourse, activeMaterial) : undefined}/>}

        {tab === 'cursos' && route.materialStudyMode && !['flashcards', 'multiple-choice'].includes(route.materialStudyMode) && activeCourse && activeMaterial && <StudyMethodPage key={`${activeMaterial.id}:${route.materialStudyMode}`} course={activeCourse} material={activeMaterial} mode={route.materialStudyMode} onBack={() => navigate(activeMaterial.sourceType === 'pdf' ? materialWorkspacePath(activeCourse.id, activeMaterial.id) : materialPath(activeCourse.id, activeMaterial.id))} onGenerate={generateArtifact} onRecall={(concept, rating) => recordRecall(activeMaterial.id, concept, rating)} onPractice={(type, index, correct) => recordActivity(activeMaterial.id, value => ({ ...value, practiceAttempts: { ...value.practiceAttempts, [`${type}:${index}`]: correct } }))}/>}

        {tab === 'cursos' && route.materialId && !route.workspace && (!route.materialStudyMode || ['flashcards', 'multiple-choice'].includes(route.materialStudyMode)) && <section className="course-study-page"><div className="course-study-context"><div><p className="eyebrow">Dentro de {activeCourse?.name ?? 'tu curso'}</p><h2>Estudia este material</h2></div><button className="secondary" onClick={() => activeCourse && navigate(activeMaterial?.sourceType === 'pdf' ? materialWorkspacePath(activeCourse.id, activeMaterial.id) : coursePath(activeCourse.id))}>{activeMaterial?.sourceType === 'pdf' ? '← Volver al PDF' : '← Ver todos los materiales'}</button></div><div className="study-layout">
          <aside className="panel material-nav"><div className="section-head compact"><div><p className="eyebrow">Material</p><h3>{activeCourse?.name ?? 'Curso'}</h3></div></div>{activeCourse?.materials.map(material => <button key={material.id} className={`material-nav-item ${activeMaterial?.id === material.id ? 'active' : ''}`} onClick={() => openMaterial(activeCourse.id, material.id)}><span>{material.sourceType === 'pdf' ? 'P' : '≡'}</span><div><strong>{material.title}</strong><small>{material.studyPackMeta?.source === 'nexo-ai' ? '✦ Preparado por Nexo IA' : material.pages?.length ? `${material.pages.length} páginas` : `${material.text.length} caracteres`}</small></div></button>)}<button className="secondary full" onClick={() => setShowMaterialForm(true)}>+ Agregar material</button></aside>
          <div className="panel study-stage">{pack && activeMaterial ? <>
            <div className="study-heading"><div><p className="eyebrow">Sesión de estudio</p><h2>{activeMaterial.title}</h2>{activeMaterial.sourceName && <small className="source-line">{activeMaterial.sourceType === 'pdf' ? '📄' : '📝'} {activeMaterial.sourceName}</small>}</div><div className="study-heading-actions">{studyMode === 'summary' && <button className="secondary ai-regenerate" disabled={aiGeneratingMaterialId === activeMaterial.id} onClick={regenerateActiveMaterial}>{aiGeneratingMaterialId === activeMaterial.id ? '✦ Preparando…' : '✦ Preparar Study Pack completo'}</button>}{studyMode === 'flashcards' && flashArtifact?.status === 'ready' && <button className="secondary ai-regenerate" onClick={() => generateArtifact('flashcards', true)}>Regenerar tarjetas</button>}{studyMode === 'quiz' && quizArtifact?.status === 'ready' && <button className="secondary ai-regenerate" onClick={() => generateArtifact('multiple_choice', true)}>Regenerar preguntas</button>}<div className="mode-tabs"><button className={studyMode === 'summary' ? 'active' : ''} onClick={() => setStudyMode('summary')}>Resumen</button><button className={studyMode === 'flashcards' ? 'active' : ''} onClick={() => setStudyMode('flashcards')}>Flashcards</button><button className={studyMode === 'quiz' ? 'active' : ''} onClick={() => setStudyMode('quiz')}>Quiz</button><button className={studyMode === 'tutor' ? 'active' : ''} onClick={() => setStudyMode('tutor')}>Tutor</button></div></div></div>
            {aiGeneratingMaterialId === activeMaterial.id && <StudyGenerationBanner material={activeMaterial} />}
            {aiGenerationErrors[activeMaterial.id] && <div className="study-ai-error"><div><strong>No pude completar la preparación con IA.</strong><p>{aiGenerationErrors[activeMaterial.id]} Puedes seguir estudiando con el paquete local o intentarlo otra vez.</p></div><button className="secondary" onClick={regenerateActiveMaterial}>Reintentar</button></div>}
            {studyMode === 'summary' && <SummaryView pack={pack} material={activeMaterial} />}
            {studyMode === 'flashcards' && (activeMaterial.sourceType === 'pdf' && flashArtifact?.status !== 'ready' ? <ArtifactGate name="flashcards" status={flashArtifact?.status} onGenerate={() => generateArtifact('flashcards')} /> : <FlashcardView pack={pack} index={flashIndex} revealed={flashRevealed} setIndex={setFlashIndex} setRevealed={setFlashRevealed} onReveal={index => recordActivity(activeMaterial.id, value => ({ ...value, flashcardsSeen: [...new Set([...(value.flashcardsSeen ?? []), index])] }))} onRate={(index, rating) => recordRecall(activeMaterial.id, pack.flashcards[index].concept || pack.flashcards[index].front, rating)} />)}
            {studyMode === 'quiz' && (activeMaterial.sourceType === 'pdf' && quizArtifact?.status !== 'ready' ? <ArtifactGate name="preguntas de opción múltiple" status={quizArtifact?.status} onGenerate={() => generateArtifact('multiple_choice')} /> : <QuizView pack={pack} answers={quizAnswers} setAnswers={setQuizAnswers} onAnswer={(index, correct) => { recordActivity(activeMaterial.id, value => ({ ...value, answers: { ...value.answers, [`quiz:${index}`]: correct } })); recordRecall(activeMaterial.id, pack.quiz[index].concept || pack.quiz[index].question, correct ? 'good' : 'again') }} />)}
            {studyMode === 'tutor' && <TutorView key={activeMaterial.id} material={activeMaterial} />}
          </> : <EmptyState title="No hay material seleccionado" text="Entra a un curso y agrega un PDF para crear una sesión de estudio." action="Ver cursos" onClick={() => navigate('/courses')} />}</div>
        </div></section>}

        {tab === 'progreso' && <ProgressPage workspace={workspaces.selectedWorkspace} courses={workspaceCourses} activity={activity} memory={memory} sessions={sessions.filter(session => workspaceCourses.some(course => course.id === session.courseId))} onOpenMaterial={openMaterial} />}
        </Suspense>
      </main>

      <nav className="mobile-nav" aria-label="Navegación móvil">
        <NavButton icon="⌂" label="Inicio" active={tab === 'inicio'} onClick={() => setTab('inicio')}/>
        <NavButton icon="▦" label="Cursos" active={tab === 'cursos'} onClick={() => setTab('cursos')}/>
        <NavButton icon="⌁" label="Resolver" active={tab === 'resolver'} onClick={() => setTab('resolver')}/>
        <NavButton icon="✎" label="Corrector" active={tab === 'corrector'} onClick={() => setTab('corrector')}/>
        <NavButton icon="↗" label="Progreso" active={tab === 'progreso'} onClick={() => setTab('progreso')}/>
      </nav>

      {showCourseForm && <Modal title={`Nuevo curso · ${workspaces.selectedWorkspace.name}`} onClose={() => setShowCourseForm(false)}><div className="course-emoji-preview"><span>{courseEmoji}</span><div><strong>Un curso para {workspaces.selectedWorkspace.name}</strong><small>Quedará dentro de este espacio y su avance se medirá aquí.</small></div></div><div className="course-emoji-picker">{['📘','🧠','🧪','🩺','🦷','📐','⚛️','💻','📚','🌎','⚖️','💹','🧬','🔬','🎨','🎯'].map(emoji => <button key={emoji} className={courseEmoji === emoji ? 'active' : ''} onClick={() => setCourseEmoji(emoji)}>{emoji}</button>)}</div><label>Nombre del curso<input autoFocus value={courseName} onChange={e => setCourseName(e.target.value)} placeholder="Ej. Histología" onKeyDown={e => e.key === 'Enter' && addCourse()} /></label>{courseError && <div role="alert" className="auth-alert error">{courseError}</div>}<div className="modal-actions"><button className="secondary" onClick={() => setShowCourseForm(false)}>Cancelar</button><button className="primary" disabled={courseBusy || !courseName.trim()} onClick={addCourse}>{courseBusy ? 'Creando…' : 'Crear curso'}</button></div></Modal>}

      {showMaterialForm && <Modal title={`Agregar material${activeCourse ? ` · ${activeCourse.name}` : ''}`} onClose={() => { setShowMaterialForm(false); resetMaterialForm() }} wide>{!activeCourse ? <p>Primero crea un curso.</p> : <><div className="upload-box"><input id="file-upload" type="file" accept=".txt,.md,.pdf" onChange={e => importFile(e.target.files?.[0])}/><label htmlFor="file-upload"><span>↑</span><strong>Subir PDF, TXT o MD</strong><small>Un PDF abre su espacio de inmediato. Nexo lo lee en segundo plano; límite de 25 MB y 250 páginas.</small></label></div>{importStatus && <div className={`import-status ${importStatus.startsWith('⚠') ? 'error' : ''}`}>{importStatus}</div>}<label>Título<input value={materialTitle} onChange={e => setMaterialTitle(e.target.value)} placeholder="Ej. Clase 04 — Patología oral" /></label><label>Texto extraído / apuntes<textarea rows={7} value={materialText} onChange={e => { setMaterialText(e.target.value); if (!sourceName) setSourceType('text') }} placeholder="También puedes pegar aquí tus apuntes directamente…" /></label><div className="modal-actions"><button className="secondary" onClick={() => { setShowMaterialForm(false); resetMaterialForm() }}>Cancelar</button><button className="primary" disabled={!materialTitle.trim() || !materialText.trim()} onClick={addMaterial}>Guardar y estudiar</button></div></>}</Modal>}
      {tab !== 'resolver' && <FeedbackWidget context={pathname} />}
    </div>
  )
}

function NavButton({ icon, label, active, onClick }: { icon: string; label: string; active: boolean; onClick: () => void }) { return <button className={`nav-button ${active ? 'active' : ''}`} title={label} aria-label={label} aria-current={active ? 'page' : undefined} onClick={onClick}><Icon name={icon}/><span className="nav-label">{label}</span></button> }
function Stat({ label, value, hint }: { label: string; value: string; hint: string }) { return <div className="stat-card"><p>{label}</p><strong>{value}</strong><small>{hint}</small></div> }
function EmptyState({ title, text, action, onClick }: { title: string; text: string; action?: string; onClick?: () => void }) { return <div className="empty-state"><span>✦</span><h3>{title}</h3><p>{text}</p>{action && onClick && <button className="primary" onClick={onClick}>{action}</button>}</div> }

function ArtifactGate({ name, status, onGenerate }: { name: string; status?: StudyArtifact['status']; onGenerate: () => void }) {
  return <div className="artifact-gate"><span>✦</span><h3>{status === 'processing' ? `Nexo está preparando ${name}` : status === 'failed' ? `No pudimos preparar ${name}` : `Todavía no hay ${name}`}</h3><p>{status === 'processing' ? 'Puedes volver al documento mientras Nexo trabaja. El resultado se guardará para la próxima vez.' : 'Nexo utilizará fragmentos de este material y guardará el resultado para reutilizarlo.'}</p>{status !== 'processing' && <button className="primary" onClick={onGenerate}>{status === 'failed' ? 'Reintentar' : `Generar ${name} con Nexo`}</button>}</div>
}

function StudyGenerationBanner({ material }: { material: Material }) {
  return <div className="study-generating"><div className="study-generating-orb">✦</div><div><strong>Nexo IA está preparando tu sesión</strong><p>Analizando {material.pages?.length ? `${material.pages.length} páginas` : 'el material'}, seleccionando conceptos importantes y construyendo flashcards + preguntas.</p><div className="study-generation-track"><span/></div></div></div>
}

function SummaryView({ pack, material }: { pack: StudyPack; material: Material }) {
  const ai = material.studyPackMeta?.source === 'nexo-ai'
  const summaryPayload = material.artifacts?.find(artifact => artifact.type === 'summary' && artifact.status === 'ready')?.payload
  const minimumSummary = summaryPayload && typeof summaryPayload === 'object' && !Array.isArray(summaryPayload) && 'summary' in summaryPayload && typeof summaryPayload.summary === 'string'
    ? summaryPayload.summary : ''
  return <div className="study-content"><div className="ai-note"><span>{ai ? '✦' : '⚙'}</span><div><strong>{ai ? 'Preparado por Nexo IA' : 'Paquete local de respaldo'}</strong><p>{ai ? `Generado para un enfoque ${material.studyPackMeta?.focus || 'equilibrado'}${material.studyPackMeta?.sampledPages?.length ? ` · ${material.studyPackMeta.sampledPages.length} páginas muestreadas` : ''}.` : 'Este material sigue disponible aunque la generación con IA todavía no se haya completado.'}</p></div></div>{!ai && minimumSummary && <div className="material-minimum-summary"><strong>Vista rápida del material</strong><p>{minimumSummary}</p></div>}<div className="keyword-row">{pack.keywords.slice(0, 10).map(k => <span key={k}>{k}</span>)}</div><div className="summary-list">{pack.summary.map((item, index) => <div key={index}><span>{String(index + 1).padStart(2, '0')}</span><p>{item.replace(/\.$/, '')}.</p></div>)}</div></div>
}

function FlashcardView({ pack, index, revealed, setIndex, setRevealed, onReveal, onRate }: { pack: StudyPack; index: number; revealed: boolean; setIndex: (n: number) => void; setRevealed: (v: boolean) => void; onReveal: (index: number) => void; onRate: (index: number, rating: RecallRating) => void }) {
  const safeIndex = Math.min(index, Math.max(0, pack.flashcards.length - 1))
  const card = pack.flashcards[safeIndex]
  const move = (delta: number) => { if (!pack.flashcards.length) return; setIndex((safeIndex + delta + pack.flashcards.length) % pack.flashcards.length); setRevealed(false) }
  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return
      if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1) }
      if (event.key === 'ArrowRight') { event.preventDefault(); move(1) }
    }
    window.addEventListener('keydown', keys)
    return () => window.removeEventListener('keydown', keys)
  }, [safeIndex, pack.flashcards.length, setIndex, setRevealed])
  if (!card) return <div className="tutor-empty"><span>✦</span><p>No hay flashcards disponibles todavía.</p></div>
  return <div className="flash-wrap"><p className="counter">Tarjeta {safeIndex + 1} de {pack.flashcards.length}{card.sourcePage ? ` · Página ${card.sourcePage}` : ''}</p><button className={`flashcard ${revealed ? 'revealed' : ''}`} onClick={() => { if (!revealed) onReveal(safeIndex); setRevealed(!revealed) }}><small>{revealed ? 'RESPUESTA' : 'PREGUNTA'}</small><strong>{revealed ? card.back : card.front}</strong><span>{revealed ? 'Toca para volver' : 'Toca para revelar'}</span></button>{revealed && <div className="flash-rating" role="group" aria-label="¿Cómo recordaste esta tarjeta?">{([['again', 'No sabía'], ['hard', 'Difícil'], ['good', 'Bien'], ['easy', 'Fácil']] as [RecallRating, string][]).map(([rating, label]) => <button key={rating} className="secondary" onClick={() => { onRate(safeIndex, rating); move(1) }}>{label}</button>)}</div>}<div className="flash-controls"><button className="secondary" onClick={() => move(-1)}>← Anterior</button><button className="primary" onClick={() => move(1)}>Siguiente →</button></div></div>
}

function QuizView({ pack, answers, setAnswers, onAnswer }: { pack: StudyPack; answers: Record<number, number>; setAnswers: (value: Record<number, number>) => void; onAnswer: (index: number, correct: boolean) => void }) {
  const answered = Object.keys(answers).length
  const correct = Object.entries(answers).filter(([i, a]) => pack.quiz[Number(i)]?.answer === a).length
  return <div className="quiz-list"><div className="quiz-toolbar"><div><p className="eyebrow">Práctica a tu ritmo</p><h3>Quiz del material</h3></div><div className="quiz-toolbar-actions"><div className="score-chip">{answered}/{pack.quiz.length} · {answered ? Math.round(correct / answered * 100) : 0}%</div>{answered > 0 && <button className="secondary quiz-reset" onClick={() => setAnswers({})}>Practicar de nuevo</button>}</div></div>{pack.quiz.map((question, qi) => { const selected = answers[qi]; const done = selected !== undefined; return <article className="quiz-card" key={qi}><div className="question-number">Pregunta {qi + 1}{question.sourcePage ? ` · pág. ${question.sourcePage}` : ''}</div><h3>{question.question}</h3><div className="options">{question.options.map((option, oi) => { const ok = done && oi === question.answer; const wrong = done && oi === selected && oi !== question.answer; return <button disabled={done} className={`${ok ? 'correct' : ''} ${wrong ? 'wrong' : ''}`} key={oi} onClick={() => { onAnswer(qi, oi === question.answer); setAnswers({ ...answers, [qi]: oi }) }}><span>{String.fromCharCode(65 + oi)}</span>{option}</button> })}</div>{done && <div className={`feedback ${selected === question.answer ? 'ok' : 'no'}`}><strong>{selected === question.answer ? '✓ Correcto' : '✕ Revisa esta idea'}</strong><p>{question.explanation}</p></div>}</article>})}</div>
}

function TutorView({ material }: { material: Material }) {
  const [question, setQuestion] = useState('')
  const [history, setHistory] = useState<{ q: string; a: TutorAnswer }[]>([])
  const ask = () => { const q = question.trim(); if (!q) return; setHistory(prev => [...prev, { q, a: askMaterial(material, q) }]); setQuestion('') }
  return <div className="tutor-wrap"><div className="ai-note"><span>🧠</span><div><strong>Tutor del material</strong><p>Busca evidencia dentro del documento y conserva referencias de página cuando están disponibles.</p></div></div><div className="tutor-chat">{history.length === 0 && <div className="tutor-empty"><span>✦</span><p>Prueba: “¿Qué función tiene…?”, “¿Cuál es la diferencia entre…?” o escribe un concepto del PDF.</p></div>}{history.map((item, i) => <div className="chat-turn" key={i}><div className="user-bubble">{item.q}</div><div className="tutor-bubble"><div className="confidence">Confianza {item.a.confidence}</div><p>{item.a.answer}</p>{item.a.citations.length > 0 && <div className="citations">{item.a.citations.map((c, j) => <div key={j}><strong>{c.page ? `Página ${c.page}` : 'Material'}</strong><span>{c.excerpt}</span></div>)}</div>}</div></div>)}</div><div className="tutor-input"><textarea rows={2} value={question} onChange={e => setQuestion(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask() } }} placeholder="Pregunta algo sobre este material…"/><button className="primary" onClick={ask}>Preguntar</button></div></div>
}

function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) { return <Dialog title={title} onClose={onClose} className={`modal ${wide ? 'wide-modal' : ''}`}><div className="modal-head"><h2>{title}</h2><button aria-label="Cerrar diálogo" onClick={onClose}>×</button></div>{children}</Dialog> }
function tabTitle(tab: AppTab) { const hour = new Date().getHours(); return ({ inicio: `${hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches'} 👋`, cursos: 'Mis cursos', resolver: 'Resolver con Nexo IA', corrector: 'Corrector de trabajos', progreso: 'Tu progreso' } as const)[tab] }
export default App
