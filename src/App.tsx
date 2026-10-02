import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { demoCourses } from './data/demo'
import { extractPdf, INITIAL_PDF_PAGE_BUDGET, MAX_PDF_BYTES } from './lib/documentEngine'
import { chunksForMaterial, topicsForMaterial } from './lib/learningContext'
import { displayMaterialTitle, suggestMaterialTitle } from './lib/materialTitles'
import { quickSummaryFor } from './lib/quickSummary'
import { loadCourseArtifacts, loadCourseDetails, loadCourseSolutions, loadSavedSolution, loadPageText, loadMaterialContext, saveSolution, saveActivity, saveArtifact, saveCourses, saveLearningState, saveMaterialContext, saveSessionEvents, saveSessions, renameMaterial, signedPdfUrl, synchronizeCourses, uploadPrivatePdf } from './lib/learningRepository'
import { applyRecall, loadLearningMemory, saveLearningMemory, type LearningMemory, type RecallRating } from './lib/learningState'
import { activateStudySession, buildStudySession, completeSessionStep, loadLocalSessionEvents, loadLocalSessions, saveLocalSessionEvents, saveLocalSessions, type SessionDuration, type SessionObjective } from './lib/studySessions'
import { artifactFlashcards, artifactPage, artifactQuestions, generateArtifactWithAI } from './lib/artifactPrompts'
import { generateStudyPack } from './lib/studyEngine'
import { generateStudyPackWithAI } from './lib/studyAi'
import { askMaterial } from './lib/tutorEngine'
import { coursePath, courseSectionPath, materialPath, materialStudyPath, materialWorkspacePath, parseAppRoute, tabPath, type AppTab, type MaterialStudyMode, type CourseSection } from './lib/router'
import type { Course, Material, SavedSolution, SolutionDraft, StudyArtifact, StudyArtifactType, StudyFocus, StudyLevel, StudyPack, StudySession, StudySessionEvent, TutorAnswer } from './types'
import { useAuth } from './auth/AuthContext'
import type { User } from '@supabase/supabase-js'
import { BrandLogo } from './BrandLogo'
import { FeedbackDialog } from './FeedbackWidget'
import { AccountMenu, type AccountAction } from './AccountMenu'
import { AccountUtilities, useAccountIdentity } from './AccountUtilities'
import { Dialog } from './Dialog'
import { Icon } from './Icon'
import { authErrorMessage } from './auth/authErrors'
import { useBodyScrollLock } from './hooks/useBodyScrollLock'
import { useWorkspaces } from './hooks/useWorkspaces'
import { coursesInWorkspace, workspaceForCourse, GENERAL_WORKSPACE } from './lib/workspaces'
import { loadStudyActivity, materialProgress, saveStudyActivity, studyPackFor, workspaceProgress, type MaterialActivity, type StudyActivity } from './lib/studyProgress'
import { WorkspaceSwitcher } from './WorkspaceSwitcher'
const FoldersPage = lazy(() => import('./FoldersPage').then(module => ({ default: module.FoldersPage })))
const ProgressPage = lazy(() => import('./ProgressPage').then(module => ({ default: module.ProgressPage })))
import { CourseOverview } from './CourseOverview'
const GlobalSearch = lazy(() => import('./GlobalSearch').then(module => ({ default: module.GlobalSearch })))
const SaveSolutionDialog = lazy(() => import('./SaveSolutionDialog').then(module => ({ default: module.SaveSolutionDialog })))
const SavedSolutionDialog = lazy(() => import('./SavedSolutionDialog').then(module => ({ default: module.SavedSolutionDialog })))
import { CourseLibrary } from './CourseLibrary'
import { EmptyState } from './EmptyState'
import { CourseCard } from './CourseCard'
import { MaterialCard } from './MaterialCard'
import { AcademicItemDialog, type AcademicEdit } from './AcademicItemDialog'
import { AdaptiveHome } from './AdaptiveHome'
import { FlashcardView, QuizView } from './PracticeViews'
import { todayActions, type CourseRecommendation } from './lib/productIntelligence'
import type { ExamItem } from './ExamRunner'

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
    analysisStatus: material.sourceType === 'pdf' && (material.analysisStatus === 'reading' || material.analysisStatus === 'indexing')
      ? (material.chunks?.length ? 'partial' as const : 'failed' as const) : material.analysisStatus,
    processingStage: undefined,
    analysisProgress: undefined,
    artifacts: material.artifacts?.map(artifact => artifact.status === 'queued' || artifact.status === 'processing'
      ? { ...artifact, status: 'failed' as const, errorMessage: 'La preparación se interrumpió. Puedes reintentarla.' } : artifact),
  })) }))
}

function withMinimumSummary(material: Material): Material {
  if (material.artifacts?.some(artifact => artifact.type === 'summary' && artifact.status === 'ready')) return material
  const summary = quickSummaryFor(material)
  if (!summary) return material
  const now = new Date().toISOString()
  return { ...material, artifacts: [...(material.artifacts ?? []), {
    id: crypto.randomUUID(), type: 'summary', status: 'ready', payload: { summary },
    version: 1, sourceMaterialId: material.id, createdAt: now, updatedAt: now,
  }] }
}

function mergeRemoteActivity(remote: StudyActivity, local: StudyActivity): StudyActivity {
  const merged = { ...remote }
  for (const [id, value] of Object.entries(local)) {
    if (!merged[id] || (value.lastStudiedAt ?? '') >= (merged[id].lastStudiedAt ?? '')) merged[id] = value
  }
  return merged
}

function mergeRemoteMemory(remote: LearningMemory, local: LearningMemory): LearningMemory {
  const merged = { ...remote }
  for (const [key, value] of Object.entries(local)) {
    if (!merged[key] || value.updatedAt >= merged[key].updatedAt) merged[key] = value
  }
  return merged
}

function mergeRemoteSessions(local: StudySession[], remote: StudySession[]): StudySession[] {
  const merged = new Map(local.map(session => [session.id, session]))
  for (const session of remote) {
    const existing = merged.get(session.id)
    const remoteSteps = Object.values(session.results).filter(value => value === 1).length
    const localSteps = existing ? Object.values(existing.results).filter(value => value === 1).length : 0
    if (!existing || session.status === 'completed' && existing.status !== 'completed' || remoteSteps > localSteps)
      merged.set(session.id, session)
  }
  return [...merged.values()]
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
  const [sessionEvents, setSessionEvents] = useState<StudySessionEvent[]>(() => loadLocalSessionEvents(user.id))
  const workspaceCourses = useMemo(() => coursesInWorkspace(courses, workspaces.memberships, workspaces.selectedId), [courses, workspaces.memberships, workspaces.selectedId])
  const [activeCourseId, setActiveCourseId] = useState(route.courseId || courses[0]?.id || '')
  const [activeMaterialId, setActiveMaterialId] = useState(route.materialId || courses[0]?.materials[0]?.id || '')
  const [showCourseForm, setShowCourseForm] = useState(false)
  const [courseBusy, setCourseBusy] = useState(false)
  const [courseError, setCourseError] = useState('')
  const [showMaterialForm, setShowMaterialForm] = useState(false)
  const [showGlobalSearch, setShowGlobalSearch] = useState(false)
  const [resolverThreadId, setResolverThreadId] = useState<string | undefined>()
  const [solutionDraft, setSolutionDraft] = useState<SolutionDraft | null>(null)
  const [solutionsByCourse, setSolutionsByCourse] = useState<Record<string, SavedSolution[]>>({})
  const [selectedSolution, setSelectedSolution] = useState<SavedSolution | null>(null)
  const [solutionsLoading, setSolutionsLoading] = useState(false)
  const [solutionsError, setSolutionsError] = useState('')
  const [solutionRetry, setSolutionRetry] = useState(0)
  const [courseAiSeed, setCourseAiSeed] = useState<{ solution: SavedSolution; question: string } | null>(null)
  const [academicEdit, setAcademicEdit] = useState<AcademicEdit | null>(null)
  const [utility, setUtility] = useState<AccountAction | null>(null)
  const { identity, onName } = useAccountIdentity(user)
  const [reducedMotion, setReducedMotion] = useState(() => { try { return localStorage.getItem('nexo-reduced-motion') === 'true' } catch { return false } })
  useEffect(() => { document.documentElement.dataset.reducedMotion = String(reducedMotion); try { localStorage.setItem('nexo-reduced-motion', String(reducedMotion)) } catch {} }, [reducedMotion])
  const [uploadCourseId, setUploadCourseId] = useState('')
  const [pendingUploadFile, setPendingUploadFile] = useState<File | null>(null)
  const [manualDraft, setManualDraft] = useState(false)
  const [resumeUploadAfterCourse, setResumeUploadAfterCourse] = useState(false)
  const [courseName, setCourseName] = useState('')
  const [courseEmoji, setCourseEmoji] = useState('📘')
  const [materialTitle, setMaterialTitle] = useState('')
  const [materialText, setMaterialText] = useState('')
  const [materialPages, setMaterialPages] = useState<Material['pages']>()
  const [sourceType, setSourceType] = useState<Material['sourceType']>('text')
  const [sourceName, setSourceName] = useState('')
  const [importStatus, setImportStatus] = useState('')

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault(); setShowGlobalSearch(true)
      }
    }
    document.addEventListener('keydown', shortcut)
    return () => document.removeEventListener('keydown', shortcut)
  }, [])
  const [studyMode, setStudyMode] = useState<StudyMode>('summary')
  const [flashIndex, setFlashIndex] = useState(0)
  const [flashRevealed, setFlashRevealed] = useState(false)
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>({})
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('nexo-study-sidebar-collapsed') === 'true' }
    catch { return false }
  })
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  useBodyScrollLock(mobileSidebarOpen)
  useEffect(() => {
    const media = window.matchMedia('(max-width: 700px)')
    const resized = () => { if (!media.matches) setMobileSidebarOpen(false) }
    media.addEventListener('change', resized)
    return () => media.removeEventListener('change', resized)
  }, [])
  const [showWorkspaceDrawer, setShowWorkspaceDrawer] = useState(() => window.location.pathname === '/folders')
  const [signingOut, setSigningOut] = useState(false)
  const [accountError, setAccountError] = useState('')
  const [storageError, setStorageError] = useState('')
  const [syncError, setSyncError] = useState('')
  const [syncRetry, setSyncRetry] = useState(0)
  const [learningReady, setLearningReady] = useState(false)
  const [remoteEnabled, setRemoteEnabled] = useState(false)
  const sidebarRef = useRef<HTMLElement>(null)
  const mobileMenuRef = useRef<HTMLButtonElement>(null)
  const [aiGeneratingMaterialId, setAiGeneratingMaterialId] = useState<string | null>(null)
  const [aiGenerationErrors, setAiGenerationErrors] = useState<Record<string, string>>({})
  const [pdfFiles, setPdfFiles] = useState<Record<string, File>>({})
  const pdfJobsRef = useRef<Map<string, AbortController>>(new Map())
  const loadedCoursesRef = useRef<Set<string>>(new Set())
  const loadedMaterialsRef = useRef<Set<string>>(new Set())
  const loadedLibrariesRef = useRef<Set<string>>(new Set())
  const [sourceJump, setSourceJump] = useState<{ materialId: string; page: number; artifactId?: string } | null>(null)
  const remoteQueueRef = useRef<Promise<void>>(Promise.resolve())
  const savedEventIdsRef = useRef<Set<string>>(new Set())
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
      setActivity(current => mergeRemoteActivity(result.activity, current))
      setMemory(current => mergeRemoteMemory(result.memory, current))
      setSessions(current => mergeRemoteSessions(current, result.sessions))
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
        const pendingEvents = sessionEvents.filter(event => !savedEventIdsRef.current.has(event.id))
        if (pendingEvents.length) {
          await saveSessionEvents(user.id, pendingEvents)
          for (const event of pendingEvents) savedEventIdsRef.current.add(event.id)
        }
        setSyncError('')
      }).catch(() => setSyncError('No pudimos sincronizar los últimos cambios. Permanecen guardados en este navegador.'))
    }, 500)
    return () => window.clearTimeout(timer)
  }, [user.id, courses, activity, memory, sessions, sessionEvents, learningReady, remoteEnabled, syncRetry])

  const retrySynchronization = () => {
    savedRemoteSnapshotRef.current = { courses: '', activity: '', memory: '', sessions: '' }
    loadedCoursesRef.current.clear()
    loadedMaterialsRef.current.clear()
    loadedLibrariesRef.current.clear()
    savedEventIdsRef.current.clear()
    setRemoteEnabled(false)
    setLearningReady(false)
    setSyncError('')
    setSyncRetry(value => value + 1)
  }

  useEffect(() => {
    const onPopState = () => { setPathname(window.location.pathname); setMobileSidebarOpen(false) }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const navigate = (path: string, replace = false) => {
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
    return () => { document.removeEventListener('keydown', closeOnEscape) }
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

  useEffect(() => {
    try { saveLocalSessionEvents(user.id, sessionEvents) }
    catch { setStorageError('No pudimos guardar los eventos de esta sesión en este navegador.') }
  }, [sessionEvents, user.id])

  const recordActivity = useCallback((materialId: string, updater: (value: MaterialActivity) => MaterialActivity) => {
    setActivity(current => ({ ...current, [materialId]: { ...updater(current[materialId] ?? {}), lastStudiedAt: new Date().toISOString() } }))
  }, [])
  const recordRecall = useCallback((materialId: string, label: string, rating: RecallRating) => {
    setMemory(current => applyRecall(current, materialId, label, rating))
    recordActivity(materialId, value => value)
  }, [recordActivity])

  const recordSessionEvent = (activityType: StudySessionEvent['activityType'], materialId?: string,
    result: StudySessionEvent['result'] = {}, sessionId?: string) => {
    const session = sessions.find(item => item.id === sessionId) ?? sessions.find(item => item.status !== 'completed' &&
      item.plan.some(step => step.materialId === materialId))
    if (!session) return
    setSessions(current => current.map(item => item.id === session.id ? activateStudySession(item) : item))
    setSessionEvents(current => [...current, { id: crypto.randomUUID(), sessionId: session.id,
      activityType, materialId, result, createdAt: new Date().toISOString() }])
  }

  const recordFlashcardRating = (materialId: string, concept: string, rating: RecallRating) => {
    recordRecall(materialId, concept, rating)
    recordSessionEvent('flashcard_answer', materialId, { rating })
  }
  const recordQuizAnswer = (materialId: string, concept: string, index: number, correct: boolean) => {
    recordActivity(materialId, value => ({ ...value, answers: { ...value.answers, [`quiz:${index}`]: correct } }))
    recordRecall(materialId, concept, correct ? 'good' : 'again')
    recordSessionEvent('quiz_answer', materialId, { correct })
  }
  const recordMethodPractice = (materialId: string, type: 'written_questions' | 'fill_blanks' | 'exam', index: number, correct: boolean) => {
    recordActivity(materialId, value => ({ ...value, practiceAttempts: { ...value.practiceAttempts, [`${type}:${index}`]: correct } }))
    recordSessionEvent(type === 'written_questions' ? 'written_answer' : 'quiz_answer', materialId, { correct })
  }

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
    if (completeSessionStep(session, step).status === 'completed') recordSessionEvent('session_complete', undefined, {}, sessionId)
    if (materialId) recordActivity(materialId, value => ({ ...value,
      sessionSteps: [...new Set([...(value.sessionSteps ?? []), `${sessionId}:${step}`])],
    }))
  }

  const openPracticeActivity = (sessionId: string, materialId: string, mode: MaterialStudyMode) => {
    setSessions(current => current.map(item => item.id === sessionId ? activateStudySession(item) : item))
    const session = sessions.find(item => item.id === sessionId)
    if (session) navigate(materialStudyPath(session.courseId, materialId, mode))
  }

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
    for (const [materialId, controller] of pdfJobsRef.current) {
      if (route.materialId !== materialId) controller.abort()
    }
  }, [route.materialId])

  useEffect(() => () => { for (const controller of pdfJobsRef.current.values()) controller.abort() }, [])

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

  useEffect(() => {
    const courseId = route.courseId
    if (!remoteEnabled || !courseId || loadedCoursesRef.current.has(courseId)) return
    loadedCoursesRef.current.add(courseId)
    let live = true
    let finished = false
    void loadCourseDetails(user.id, courseId).then(result => {
      finished = true
      if (!live) return
      setCourses(current => current.map(course => {
        if (course.id !== courseId) return course
        const remoteIds = new Set(result.materials.map(material => material.id))
        const materials = result.materials.map(material => {
          const local = course.materials.find(item => item.id === material.id)
          if (!local) return material
          if (local.analysisStatus === 'reading' || local.analysisStatus === 'indexing') return { ...local, remotePlaceholder: false }
          return { ...material, text: material.text || local.text, pages: material.pages?.length ? material.pages : local.pages,
            chunks: local.chunks, topics: local.topics, artifacts: local.artifacts, contextLoaded: local.contextLoaded }
        })
        return { ...course, materials: [...materials, ...course.materials.filter(material => !remoteIds.has(material.id))] }
      }))
      setActivity(current => mergeRemoteActivity(result.activity, current))
      setMemory(current => mergeRemoteMemory(result.memory, current))
      setSessions(current => mergeRemoteSessions(current, result.sessions))
    }).catch(() => {
      loadedCoursesRef.current.delete(courseId)
      if (live) setSyncError('No pudimos cargar este curso desde tu cuenta. Puedes reintentar la sincronización.')
    })
    return () => { live = false; if (!finished) loadedCoursesRef.current.delete(courseId) }
  }, [remoteEnabled, route.courseId, user.id, syncRetry])

  useEffect(() => {
    const materialId = route.materialId
    if (!remoteEnabled || !materialId || !activeMaterial || loadedMaterialsRef.current.has(materialId)) return
    if (activeMaterial.contextLoaded || (activeMaterial.chunks?.length && activeMaterial.artifacts?.length)) return
    loadedMaterialsRef.current.add(materialId)
    let live = true
    let finished = false
    void loadMaterialContext(user.id, materialId).then(result => {
      finished = true
      if (!live) return
      setCourses(current => current.map(course => ({ ...course, materials: course.materials.map(material => {
        if (material.id !== materialId) return material
        const remoteArtifactKeys = new Set(result.artifacts.map(artifact => `${artifact.type}:${artifact.version}`))
        const localArtifacts = material.artifacts?.filter(artifact => !remoteArtifactKeys.has(`${artifact.type}:${artifact.version}`)) ?? []
        const chunks = result.chunks.length ? result.chunks : material.chunks ?? []
        return { ...material, chunks, topics: result.topics.length ? result.topics : material.topics,
          artifacts: [...result.artifacts, ...localArtifacts],
          text: material.text || (material.sourceType === 'pdf' ? chunks.map(chunk => chunk.text).join('\n\n').slice(0, 30000) : ''),
          contextLoaded: true }
      }) })))
    }).catch(() => {
      loadedMaterialsRef.current.delete(materialId)
      if (live) setSyncError('No pudimos cargar el análisis de este material. Puedes reintentar la sincronización.')
    })
    return () => { live = false; if (!finished) loadedMaterialsRef.current.delete(materialId) }
  }, [remoteEnabled, route.materialId, activeMaterial?.id, activeMaterial?.contextLoaded, user.id, syncRetry])

  useEffect(() => {
    const courseId = route.courseId
    if (!remoteEnabled || !courseId || route.courseSection !== 'library' || loadedLibrariesRef.current.has(courseId)) return
    loadedLibrariesRef.current.add(courseId)
    let live = true
    let finished = false
    void loadCourseArtifacts(user.id, courseId).then(artifacts => {
      finished = true
      if (!live) return
      setCourses(current => current.map(course => course.id !== courseId ? course : { ...course,
        materials: course.materials.map(material => {
          const remote = artifacts.filter(artifact => artifact.sourceMaterialId === material.id)
          const keys = new Set(remote.map(artifact => `${artifact.type}:${artifact.version}`))
          return { ...material, artifacts: [...remote, ...(material.artifacts ?? []).filter(artifact => !keys.has(`${artifact.type}:${artifact.version}`))] }
        }),
      }))
    }).catch(() => {
      loadedLibrariesRef.current.delete(courseId)
      if (live) setSyncError('No pudimos cargar la biblioteca de este curso. Puedes reintentar la sincronización.')
    })
    return () => { live = false; if (!finished) loadedLibrariesRef.current.delete(courseId) }
  }, [remoteEnabled, route.courseId, route.courseSection, user.id, syncRetry])

  useEffect(() => {
    if (!route.courseId || route.courseSection !== 'library') return
    const courseId = route.courseId
    let live = true
    setSolutionsLoading(true); setSolutionsError('')
    void loadCourseSolutions(user.id, courseId).then(solutions => {
      if (live) setSolutionsByCourse(current => ({ ...current, [courseId]: solutions }))
    }).catch(() => { if (live) setSolutionsError('No pudimos cargar las soluciones. Comprueba tu conexión y vuelve a intentarlo.') })
      .finally(() => { if (live) setSolutionsLoading(false) })
    return () => { live = false }
  }, [route.courseId, route.courseSection, user.id, solutionRetry])

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
    const cards = activeMaterial.artifacts?.filter(item => item.type === 'flashcards' && item.status === 'ready' && !artifactPage(item)).sort((a, b) => b.version - a.version)[0]
    const questions = activeMaterial.artifacts?.filter(item => item.type === 'multiple_choice' && item.status === 'ready' && !artifactPage(item)).sort((a, b) => b.version - a.version)[0]
    return { ...fallback, flashcards: cards ? artifactFlashcards(cards.payload) : fallback.flashcards,
      quiz: questions ? artifactQuestions(questions.payload) : fallback.quiz }
  }, [activeMaterial])
  const flashArtifact = activeMaterial?.artifacts?.filter(item => item.type === 'flashcards' && !artifactPage(item)).sort((a, b) => b.version - a.version)[0]
  const quizArtifact = activeMaterial?.artifacts?.filter(item => item.type === 'multiple_choice' && !artifactPage(item)).sort((a, b) => b.version - a.version)[0]
  const totalMaterials = workspaceCourses.reduce((acc, course) => acc + course.materials.length, 0)
  const aiPreparedMaterials = workspaceCourses.reduce((acc, course) => acc + course.materials.filter(m => m.studyPackMeta?.source === 'nexo-ai').length, 0)
  const currentProgress = workspaceProgress(workspaceCourses, activity)
  const recentHomeActivity = workspaceCourses.flatMap(course => course.materials
    .filter(material => activity[material.id]?.lastStudiedAt)
    .map(material => ({ course, material, at: activity[material.id].lastStudiedAt ?? '' })))
    .sort((a, b) => b.at.localeCompare(a.at))[0]
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

  const createCourse = async (name: string, emoji = '📘', persist = false): Promise<Course> => {
    if (!name.trim() || name.trim().length > 180) throw new Error('Escribe un nombre de curso de hasta 180 caracteres.')
    const course: Course = { id: `course-${uid()}`, name: name.trim(), emoji, materials: [] }
    if (persist) await saveCourses(user.id, [course])
    if (workspaces.selectedId !== GENERAL_WORKSPACE) await workspaces.moveCourse(course.id, workspaces.selectedId)
    setCourses(prev => [...prev, course])
    return course
  }

  const addCourse = async () => {
    const name = courseName.trim(); if (!name || courseBusy) return
    setCourseBusy(true); setCourseError('')
    let course: Course
    try {
      course = await createCourse(name, courseEmoji)
    } catch (error) {
      setCourseError(error instanceof Error ? error.message : 'No pudimos crear el curso en este espacio.')
      setCourseBusy(false)
      return
    }
    setActiveCourseId(course.id)
    setCourseName(''); setCourseEmoji('📘'); setShowCourseForm(false)
    if (resumeUploadAfterCourse) {
      setUploadCourseId(course.id)
      setShowMaterialForm(true)
      setResumeUploadAfterCourse(false)
    }
    setCourseBusy(false)
    navigate(coursePath(course.id))
  }

  const resetMaterialForm = () => {
    setMaterialTitle(''); setMaterialText(''); setMaterialPages(undefined); setSourceType('text'); setSourceName('')
    setPendingUploadFile(null); setManualDraft(false); setImportStatus('')
  }

  const startMaterialUpload = (courseId?: string) => {
    resetMaterialForm()
    setUploadCourseId(courseId ?? '')
    setShowMaterialForm(true)
  }

  const addMaterial = async () => {
    const targetCourse = courses.find(course => course.id === uploadCourseId)
    if (!targetCourse || !materialTitle.trim()) return
    if (pendingUploadFile && /\.pdf$/i.test(pendingUploadFile.name)) {
      const file = pendingUploadFile
      const material: Material = {
        id: `mat-${uid()}`, title: materialTitle.trim(), text: '',
        createdAt: new Date().toISOString(), sourceType: 'pdf', sourceName: file.name,
        processingStatus: 'queued', processingStage: 'reading', analysisStatus: 'not_started', documentKind: 'unknown',
      }
      setPdfFiles(current => ({ ...current, [material.id]: file }))
      setCourses(current => current.map(item => item.id === targetCourse.id ? { ...item, materials: [...item.materials, material] } : item))
      setActiveCourseId(targetCourse.id); setActiveMaterialId(material.id)
      setShowMaterialForm(false); resetMaterialForm()
      navigate(materialWorkspacePath(targetCourse.id, material.id))
      processPdfMaterial(targetCourse, material, file)
      return
    }
    if (!materialText.trim()) return
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
      documentKind: 'text', analysisStatus: 'ready',
    }
    const chunks = chunksForMaterial(baseMaterial)
    const material = withMinimumSummary({ ...baseMaterial, chunks, topics: topicsForMaterial(baseMaterial, chunks) })
    const courseId = targetCourse.id
    setCourses(prev => prev.map(course => course.id === courseId ? { ...course, materials: [...course.materials, material] } : course))
    setActiveMaterialId(material.id)
    resetStudy()
    setShowMaterialForm(false)
    resetMaterialForm()
    navigate(materialWorkspacePath(courseId, material.id))
    if (remoteEnabled) void (async () => {
      try {
        await saveCourses(user.id, [{ ...targetCourse, materials: [...targetCourse.materials, material] }])
        await saveMaterialContext(user.id, courseId, material)
        for (const artifact of material.artifacts ?? []) await saveArtifact(user.id, courseId, artifact)
      } catch {
        setSyncError('El material está disponible aquí, pero no pudimos sincronizarlo con tu cuenta. Comprueba la conexión y vuelve a intentarlo.')
      }
    })()
  }

  const processPdfMaterial = (course: Course, material: Material, file: File, requestedPages?: number[]) => {
    setSyncError('')
    for (const controller of pdfJobsRef.current.values()) controller.abort()
    const controller = new AbortController()
    pdfJobsRef.current.set(material.id, controller)
    void (async () => {
      let uploadedPath = material.storagePath
      let accumulatedChunks = requestedPages ? [...(material.chunks ?? [])] : []
      const existingChunkCount = accumulatedChunks.length
      const upload = remoteEnabled ? (async () => {
        try {
          await saveCourses(user.id, [{ ...course, materials: [material] }])
          const storagePath = await uploadPrivatePdf(user.id, course.id, material.id, file)
          uploadedPath = storagePath
          updateMaterial(course.id, material.id, current => ({ ...current, storagePath }))
        } catch { setSyncError('El PDF está disponible en esta sesión, pero no pudimos guardarlo en tu cuenta. Revisa la conexión y vuelve a intentarlo.') }
      })() : Promise.resolve()
      try {
        updateMaterial(course.id, material.id, current => ({ ...current, processingStatus: 'processing', processingStage: 'reading', analysisStatus: 'reading', analysisProgress: undefined }))
        const extracted = await extractPdf(file, {
          signal: controller.signal, pages: requestedPages,
          onMetadata: metadata => updateMaterial(course.id, material.id, current => ({ ...current,
            pageCount: metadata.pageCount, pdfBytes: metadata.byteSize, pdfTitle: metadata.title, pdfAuthor: metadata.author,
          })),
          onBatch: (pages, progress) => {
            if (controller.signal.aborted) return
            if (pages.length) accumulatedChunks.push(...chunksForMaterial({ ...material, text: '', pages }))
            updateMaterial(course.id, material.id, current => ({ ...current,
              chunks: accumulatedChunks, text: accumulatedChunks.map(chunk => chunk.text).join('\n\n').slice(0, 30000), pages: undefined,
              analyzedPages: [...new Set([...(current.analyzedPages ?? []), ...progress.analyzedPages])].sort((a, b) => a - b),
              processingStage: 'reading', analysisStatus: 'reading',
              analysisProgress: { completed: progress.completed, total: progress.total, currentPage: progress.currentPage },
            }))
          },
        })
        updateMaterial(course.id, material.id, current => ({ ...current, processingStage: 'indexing', analysisStatus: 'indexing' }))
        const analyzedPages = [...new Set([...(requestedPages ? material.analyzedPages ?? [] : []), ...extracted.analyzedPages])].sort((a, b) => a - b)
        const textPages = new Set(accumulatedChunks.map(chunk => chunk.pageStart)).size
        const ratio = analyzedPages.length ? textPages / analyzedPages.length : 0
        const kind = ratio < 0.1 ? 'scan' : ratio < 0.85 ? 'mixed' : 'text'
        const base: Material = { ...material,
          text: accumulatedChunks.map(chunk => chunk.text).join('\n\n').slice(0, 30000), pages: undefined,
          chunks: accumulatedChunks,
          topics: requestedPages
            ? [...(material.topics ?? []), ...topicsForMaterial(material, accumulatedChunks.slice(existingChunkCount))]
            : topicsForMaterial(material, accumulatedChunks),
          pageCount: extracted.metadata.pageCount, pdfBytes: extracted.metadata.byteSize,
          pdfTitle: extracted.metadata.title, pdfAuthor: extracted.metadata.author,
          documentKind: kind, analyzedPages,
          analysisStatus: analyzedPages.length < extracted.metadata.pageCount || kind !== 'text' ? 'partial' : 'ready',
          processingStatus: 'ready', processingStage: undefined, analysisProgress: undefined,
        }
        const ready = withMinimumSummary(base)
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
        if (controller.signal.aborted) {
          updateMaterial(course.id, material.id, current => ({ ...current,
            processingStatus: current.chunks?.length ? 'ready' : 'queued',
            analysisStatus: current.chunks?.length ? 'partial' : 'not_started',
            processingStage: undefined, analysisProgress: undefined,
          }))
          return
        }
        updateMaterial(course.id, material.id, current => {
          const hasContext = Boolean(current.chunks?.length)
          return { ...current, processingStatus: hasContext ? 'ready' : 'failed',
            analysisStatus: hasContext ? 'partial' : 'failed',
            topics: hasContext && !current.topics?.length ? topicsForMaterial(current, current.chunks ?? []) : current.topics,
            processingStage: undefined, analysisProgress: undefined }
        })
        setSyncError(error instanceof Error && /^(Este PDF supera|No encontré texto seleccionable)/.test(error.message)
          ? error.message : 'No pudimos leer este PDF. Comprueba que el archivo sea válido y vuelve a intentarlo.')
      } finally {
        if (pdfJobsRef.current.get(material.id) === controller) pdfJobsRef.current.delete(material.id)
      }
    })()
  }

  const retryPdfMaterial = async (course: Course, material: Material, pages?: number[]) => {
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
    if (file) processPdfMaterial(course, material, file, pages)
  }

  const analyzeMorePdfPages = (course: Course, material: Material, selectedPages?: number[]) => {
    if (!material.pageCount) return
    const analyzed = new Set(material.analyzedPages ?? [])
    const next = selectedPages ?? Array.from({ length: material.pageCount }, (_, index) => index + 1)
      .filter(page => !analyzed.has(page)).slice(0, INITIAL_PDF_PAGE_BUDGET)
    if (next.length) void retryPdfMaterial(course, material, next)
  }

  const saveVisualAnalysis = (course: Course, material: Material, pages: number[], text: string) => {
    const chunk = { id: crypto.randomUUID(), materialId: material.id, pageStart: pages[0], pageEnd: pages[pages.length - 1], text: text.slice(0, 9000), keywords: [] }
    const chunks = [...(material.chunks ?? []), chunk]
    const next = withMinimumSummary({ ...material, text: `${material.text}\n\n${chunk.text}`.trim().slice(0, 30000),
      chunks, topics: [...(material.topics ?? []), ...topicsForMaterial(material, [chunk])],
      processingStatus: 'ready', analysisStatus: 'partial' })
    updateMaterial(course.id, material.id, () => next)
    if (remoteEnabled) void (async () => {
      try {
        await saveCourses(user.id, [{ ...course, materials: [next] }])
        await saveMaterialContext(user.id, course.id, next)
        for (const artifact of next.artifacts ?? []) if (artifact.type === 'summary') await saveArtifact(user.id, course.id, artifact)
      } catch { setSyncError('El análisis visual está disponible aquí, pero no pudimos sincronizarlo con tu cuenta.') }
    })()
  }

  const importFile = async (file?: File) => {
    if (!file) return
    if (!/\.(pdf|txt|md)$/i.test(file.name)) { setImportStatus('⚠ Usa PDF, TXT o MD.'); return }
    if (/\.pdf$/i.test(file.name) && file.size > MAX_PDF_BYTES) {
      setImportStatus('⚠ Este PDF supera 25 MB. Divide el documento y vuelve a subirlo.'); return
    }
    setPendingUploadFile(file)
    setMaterialTitle(suggestMaterialTitle(file.name))
    setSourceName(file.name)
    setManualDraft(false)
    if (/\.pdf$/i.test(file.name)) { setSourceType('pdf'); setMaterialText(''); setImportStatus('Revisa el título y confirma la subida.'); return }
    setImportStatus('Leyendo archivo…')
    try {
      setMaterialText(await file.text()); setMaterialPages(undefined); setSourceType('text'); setImportStatus('✓ Texto listo para guardar')
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
    setSourceJump(null)
    setActiveCourseId(courseId); setActiveMaterialId(materialId); resetStudy()
    navigate(materialWorkspacePath(courseId, materialId))
  }

  const openRecommendation = (course: Course, recommendation: CourseRecommendation) => {
    const material = course.materials.find(item => item.id === recommendation.materialId)
    if (recommendation.action === 'session') { navigate(courseSectionPath(course.id, 'practice')); return }
    if (!material) return
    if (recommendation.action === 'practice') { navigate(materialStudyPath(course.id, material.id, 'multiple-choice')); return }
    if (recommendation.action === 'review') { navigate(materialStudyPath(course.id, material.id, 'flashcards')); return }
    openMaterial(course.id, material.id)
    if (recommendation.action === 'analyze') analyzeMorePdfPages(course, material)
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

  const openSavedSolution = async (id: string, courseId: string) => {
    navigate(courseSectionPath(courseId, 'library'))
    try { setSelectedSolution(await loadSavedSolution(user.id, id)) }
    catch { setSolutionsError('No pudimos abrir esta solución. Reintenta desde Biblioteca.') }
  }

  const askSavedSolution = (practice: boolean) => {
    if (!selectedSolution) return
    setCourseAiSeed({ solution: selectedSolution, question: practice
      ? `Hazme 5 preguntas para practicar el concepto de esta solución: ${selectedSolution.question}`
      : `Ayúdame a comprender esta solución: ${selectedSolution.question}` })
    navigate(courseSectionPath(selectedSolution.courseId, 'ai'))
    setSelectedSolution(null)
  }

  const generateArtifact = (type: Exclude<StudyArtifactType, 'summary' | 'exam'>, force = false) => {
    if (!activeCourse || !activeMaterial || !activeMaterial.text) return
    const course = activeCourse
    const material = activeMaterial
    const previous = material.artifacts?.filter(item => item.type === type && !artifactPage(item)).sort((a, b) => b.version - a.version)[0]
    const maxVersion = Math.max(0, ...(material.artifacts ?? []).filter(item => item.type === type).map(item => item.version))
    if (!force && (previous?.status === 'ready' || previous?.status === 'processing')) return
    const now = new Date().toISOString()
    const artifact: StudyArtifact = {
      id: force || !previous ? crypto.randomUUID() : previous.id, type, status: 'processing', payload: {},
      version: force || !previous ? maxVersion + 1 : previous.version,
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

  const preparePageArtifact = async (course: Course, material: Material, page: number, type: 'summary' | 'flashcards' | 'multiple_choice') => {
    const cached = material.artifacts?.filter(item => item.type === type && artifactPage(item) === page && item.status === 'ready').sort((a, b) => b.version - a.version)[0]
    if (cached) {
      if (remoteEnabled) await saveArtifact(user.id, course.id, cached).catch(() => setSyncError('El recurso de página está disponible aquí, pero no pudimos sincronizarlo.'))
      return cached.id
    }
    if (material.artifacts?.some(item => item.type === type && artifactPage(item) === page && item.status === 'processing')) throw new Error('Nexo ya está preparando este recurso.')
    const text = await loadPageText(user.id, material, page)
    if (!text.trim()) throw new Error('Esta página no tiene texto preparado. Prepara ese rango o usa el análisis visual antes de crear recursos.')
    const now = new Date().toISOString()
    const artifact: StudyArtifact = { id: crypto.randomUUID(), type, status: 'processing', sourceMaterialId: material.id,
      version: Math.max(0, ...(material.artifacts ?? []).filter(item => item.type === type).map(item => item.version)) + 1,
      createdAt: now, updatedAt: now, payload: { scope: { page } } }
    const replace = (next: StudyArtifact) => updateMaterial(course.id, material.id, current => ({ ...current, artifacts: [...(current.artifacts ?? []).filter(item => item.id !== next.id), next] }))
    replace(artifact)
    try {
      const scoped: Material = { ...material, text, pages: [{ page, text }], chunks: [{ id: crypto.randomUUID(), materialId: material.id, pageStart: page, pageEnd: page, text, keywords: [] }] }
      const payload = await generateArtifactWithAI(course.id, course.name, scoped, type, page)
      const readyArtifact: StudyArtifact = { ...artifact, status: 'ready', updatedAt: new Date().toISOString(), payload: { ...(payload as Record<string, unknown>), scope: { page } } }
      replace(readyArtifact)
      if (remoteEnabled) {
        try { await saveCourses(user.id, [{ ...course, materials: [material] }]); await saveArtifact(user.id, course.id, readyArtifact) }
        catch { setSyncError('El recurso de página está disponible aquí, pero no pudimos sincronizarlo.') }
      }
      return readyArtifact.id
    } catch (error) { replace({ ...artifact, status: 'failed', errorMessage: 'No pudimos preparar esta página.' }); throw error }
  }

  const saveExamArtifact = (count: 10 | 20 | 40, items: ExamItem[], force = false) => {
    if (!activeCourse || !activeMaterial || !items.length) return
    const course = activeCourse
    const material = activeMaterial
    const previous = material.artifacts?.filter(item => item.type === 'exam').sort((a, b) => b.version - a.version)[0]
    if (!force && material.artifacts?.some(item => item.type === 'exam' && item.status === 'ready' &&
      typeof item.payload === 'object' && item.payload !== null && 'count' in item.payload && item.payload.count === count)) return
    const now = new Date().toISOString()
    const artifact: StudyArtifact = { id: crypto.randomUUID(), type: 'exam', status: 'ready',
      createdAt: now, updatedAt: now, sourceMaterialId: material.id, version: (previous?.version ?? 0) + 1,
      payload: { count, items } }
    updateMaterial(course.id, material.id, current => ({ ...current, artifacts: [...(current.artifacts ?? []), artifact] }))
    if (remoteEnabled) void (async () => {
      try {
        await saveCourses(user.id, [{ ...course, materials: [material] }])
        await saveArtifact(user.id, course.id, artifact)
      } catch { setSyncError('El simulacro está disponible aquí, pero no pudimos sincronizarlo con tu cuenta.') }
    })()
  }

  const openArtifact = (courseId: string, materialId: string, id: string, type: StudyArtifactType, page?: number) => {
    if (page || type === 'summary') { openMaterial(courseId, materialId); setSourceJump({ materialId, page: page ?? 1, artifactId: id }); return }
    const mode = ({ flashcards: 'flashcards', multiple_choice: 'multiple-choice', written_questions: 'written', fill_blanks: 'fill-blanks', notes: 'notes', exam: 'exam' } as Partial<Record<StudyArtifactType, MaterialStudyMode>>)[type]
    navigate(mode ? materialStudyPath(courseId, materialId, mode) : materialWorkspacePath(courseId, materialId))
  }
  const downloadMaterial = async (material: Material) => {
    try {
      const file = pdfFiles[material.id]
      const blob = file ?? await fetch(await signedPdfUrl(material.storagePath!)).then(response => { if (!response.ok) throw new Error('Download failed'); return response.blob() })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a'); link.href = url; link.download = material.sourceName || `${material.title}.pdf`; link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 10000)
    } catch { setStorageError('No pudimos descargar el original. Inténtalo de nuevo.') }
  }

  const topTitle = route.materialId ? 'Estudiar' : route.courseId ? 'Curso' : tabTitle(tab)
  const accountAction = (action: AccountAction) => {
    setMobileSidebarOpen(false)
    if (action === 'logout') { void logout(); return }
    if (action === 'admin') { if (identity.isAdmin) window.location.href = '/nexo-ops/feedback-console'; return }
    setUtility(action)
  }

  if (!workspaces.ready || !learningReady) return <div className="app-loading workspace-loading"><BrandLogo iconOnly/><strong>{!learningReady ? 'Preparando tu espacio de aprendizaje…' : workspaces.loading ? 'Cargando tus espacios…' : 'No pudimos cargar tus espacios'}</strong>{workspaces.error && learningReady && <><p>{workspaces.error}</p><button className="primary" onClick={() => workspaces.refresh()}>Reintentar</button></>}</div>

  return (
    <div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''} ${mobileSidebarOpen ? 'mobile-sidebar-open' : ''} ${showWorkspaceDrawer ? 'workspace-drawer-open' : ''} ${showCourseForm || showMaterialForm || showGlobalSearch || solutionDraft || selectedSolution || utility || academicEdit ? 'dialog-open' : ''} ${route.workspace || route.materialStudyMode ? 'intensive-study' : ''} ${tab === 'resolver' ? 'resolver-active' : ''} ${tab === 'resolver' || tab === 'corrector' || route.workspace ? 'tool-surface' : ''}`}>
      <a href="#main-content" className="skip-link">Saltar al contenido</a>
      {mobileSidebarOpen && <button className="mobile-sidebar-backdrop" aria-label="Cerrar navegación" onClick={() => { setMobileSidebarOpen(false); mobileMenuRef.current?.focus() }}/>}
      <aside ref={sidebarRef} className="sidebar" role={mobileSidebarOpen ? 'dialog' : undefined} aria-modal={mobileSidebarOpen || undefined} aria-label="Barra lateral principal">
        <div className="sidebar-top"><button className="brand" onClick={() => setTab('inicio')} aria-label="Ir al inicio"><BrandLogo compact/><span className="sidebar-beta">BETA</span></button><button className="sidebar-collapse-toggle" aria-label={sidebarCollapsed ? 'Expandir barra lateral' : 'Colapsar barra lateral'} aria-expanded={!sidebarCollapsed} onClick={() => setSidebarCollapsed(value => !value)}><Icon name={sidebarCollapsed ? 'expand' : 'collapse'}/></button><button className="sidebar-mobile-close" aria-label="Cerrar navegación" onClick={() => { setMobileSidebarOpen(false); mobileMenuRef.current?.focus() }}><Icon name="close"/></button></div>
        <nav aria-label="Navegación principal">
          <NavButton icon="⌂" label="Inicio" active={tab === 'inicio'} onClick={() => setTab('inicio')} />
          <NavButton icon="▦" label="Mis cursos" active={tab === 'cursos'} onClick={() => setTab('cursos')} />
          <NavButton icon="⌁" label="Resolver" active={tab === 'resolver'} onClick={() => setTab('resolver')} />
          <NavButton icon="✎" label="Corrector" active={tab === 'corrector'} onClick={() => setTab('corrector')} />
          <NavButton icon="↗" label="Progreso" active={tab === 'progreso'} onClick={() => setTab('progreso')} />
        </nav>
        <WorkspaceSwitcher selected={workspaces.selectedWorkspace} open={showWorkspaceDrawer} onOpenChange={setShowWorkspaceDrawer}>
          <Suspense fallback={<div className="page-skeleton" role="status">Cargando espacios…</div>}>
            {showWorkspaceDrawer && <FoldersPage allCourses={courses} folders={workspaces.folders} memberships={workspaces.memberships} selected={workspaces.selectedWorkspace} activity={activity} onSelect={switchWorkspace} onCreate={async (name, emoji) => { const created = await workspaces.createWorkspace(name, emoji); navigate('/courses'); return created }} onMove={workspaces.moveCourse} onDelete={workspaces.deleteWorkspace} onOpenCourse={id => { setShowWorkspaceDrawer(false); openCourse(id) }} />}
          </Suspense>
        </WorkspaceSwitcher>
        <div className="sidebar-mobile-tools"><button onClick={() => { setMobileSidebarOpen(false); setShowGlobalSearch(true) }}>⌕ Buscar en Nexo</button><button onClick={() => accountAction('profile')}>Perfil / Configuración</button><button onClick={() => accountAction('feedback')}>Enviar comentarios</button><button onClick={() => accountAction('help')}>Ayuda / Guía rápida</button><button disabled={signingOut} onClick={() => accountAction('logout')}>Cerrar sesión</button></div>
        <AccountMenu sidebar identity={identity} onAction={accountAction} signingOut={signingOut} error={accountError} routeKey={pathname}/>
      </aside>

      <main inert={mobileSidebarOpen || undefined} className="main-content" id="main-content" tabIndex={-1}>
        <header className="topbar"><button ref={mobileMenuRef} className="mobile-menu-toggle" aria-label="Abrir navegación" aria-expanded={mobileSidebarOpen} onClick={() => setMobileSidebarOpen(true)}><Icon name="more"/></button><div className="topbar-title"><h1>{tab === 'resolver' ? <><span className="desktop-title">{topTitle}</span><span className="mobile-title">Resolver</span></> : topTitle}</h1></div><div className="top-actions"><button className="secondary global-search-trigger" aria-label="Buscar en Nexo Study" aria-keyshortcuts="Control+k Meta+k" onClick={() => setShowGlobalSearch(true)}>⌕ <span>Buscar</span><kbd>Ctrl K</kbd></button><AccountMenu identity={identity} onAction={accountAction} signingOut={signingOut} error={accountError} routeKey={pathname}/></div></header>
        <div className="context-strip"><button className="mobile-workspace-context" aria-label={`Cambiar espacio desde el contexto. Actual: ${workspaces.selectedWorkspace.name}`} onClick={() => setShowWorkspaceDrawer(true)}>{workspaces.selectedWorkspace.emoji} {workspaces.selectedWorkspace.name} ⌄</button><span className="desktop-workspace-context">{workspaces.selectedWorkspace.emoji} {workspaces.selectedWorkspace.name}</span></div>
        {workspaces.error && <div role="status" className="workspace-warning">{workspaces.error} Estás viendo la última organización guardada. <button onClick={() => workspaces.refresh()}>Reintentar</button></div>}
        {storageError && <p role="alert" className="auth-alert error">{storageError}</p>}
        {syncError && <p role="status" className="workspace-warning">{syncError} <button onClick={retrySynchronization}>Reintentar sincronización</button></p>}

        <Suspense fallback={<div className="page-skeleton" role="status" aria-label="Abriendo tu espacio"><span/><span/><span/></div>}>

        {(route.courseId || route.materialId) && <div className="route-breadcrumbs"><button onClick={() => navigate('/courses')}>Cursos</button>{activeCourse && <><span>›</span><button onClick={() => navigate(coursePath(activeCourse.id))}>{activeCourse.emoji} {activeCourse.name}</button></>}{route.materialId && activeMaterial && <><span>›</span><strong>{activeMaterial.title}</strong></>}</div>}

        {tab === 'inicio' && <section className={`page-grid home-page ${recentHomeActivity ? 'active-home' : ''}`}>
          {recentHomeActivity && <AdaptiveHome name={identity.fullName} recent={recentHomeActivity} activity={activity} actions={todayActions(workspaceCourses, activity, memory, sessions)} onContinue={() => openMaterial(recentHomeActivity.course.id, recentHomeActivity.material.id)} onAction={action => { const course = courses.find(item => item.id === action.courseId); if (course) openRecommendation(course, action) }} onSession={() => { prepareSession(recentHomeActivity.course, 15, 'weak'); navigate(courseSectionPath(recentHomeActivity.course.id, 'practice')) }} onUpload={() => startMaterialUpload()}/>}
          {!recentHomeActivity && <div className="hero-card"><div><span className="pill">✦ Tu material. Tu manera de aprender.</span><h2>De tus apuntes a tu próximo <em>logro.</em></h2><p>Sube un PDF y encuentra claridad. Resúmenes, flashcards y preguntas para avanzar a tu ritmo.</p><div className="hero-actions"><button className="primary" onClick={() => startMaterialUpload()}>＋ Subir primer material</button><button className="text-button" onClick={() => setShowCourseForm(true)}>Crear curso</button></div><div className="hero-caption">ORGANIZA <span>·</span> COMPRENDE <span>·</span> PRACTICA</div></div><div className="hero-study-art" aria-hidden="true"><div className="art-orbit"/><div className="art-sheet art-sheet-back"/><div className="art-sheet"><span>✦ NEXO STUDY</span><h3>Todo empieza<br/>con una idea.</h3><i/><i/><i/><div><b>✓</b> Lista para aprender</div></div><div className="art-tag">✦ De PDF a posibilidades</div></div></div>}
          {!recentHomeActivity ? <div className="stats-grid"><Stat label="Cursos" value={`${workspaceCourses.length}`} hint="en este espacio"/><Stat label="Materiales" value={`${totalMaterials}`} hint="guardados"/><Stat label="PDF preparados" value={`${aiPreparedMaterials}`} hint="con Nexo IA"/><Stat label="Actividad" value={`${currentProgress.percent}%`} hint="de este espacio"/></div> : <p className="home-progress-brief">{workspaceCourses.length} cursos · {totalMaterials} materiales · {currentProgress.percent}% de actividad en este espacio</p>}
          <section className="panel wide home-courses"><div className="section-head"><div><p className="eyebrow">{workspaces.selectedWorkspace.emoji} {workspaces.selectedWorkspace.name}</p><h3>Tus cursos</h3></div><button className="text-button" onClick={() => setShowCourseForm(true)}>+ Nuevo curso</button></div>{workspaceCourses.length ? <div className="course-row">{workspaceCourses.map(course => <button className="course-mini" key={course.id} onClick={() => openCourse(course.id)}><span>{course.emoji}</span><div><strong>{course.name}</strong><small>{course.materials.length} {course.materials.length === 1 ? 'material' : 'materiales'}</small></div><b>›</b></button>)}</div> : <div className="workspace-home-empty"><p>Este espacio todavía no tiene cursos. Crea uno o abre Espacios para organizar los que ya tienes.</p></div>}</section>
        </section>}

        {tab === 'cursos' && !route.courseId && <section className="course-library-page">
          <div className="library-intro"><div><p className="eyebrow">Biblioteca · {workspaces.selectedWorkspace.emoji} {workspaces.selectedWorkspace.name}</p><h2>Mis cursos</h2><p>Abre un curso para estudiar sus materiales.</p></div><button className="primary" onClick={() => setShowCourseForm(true)}>+ Nuevo curso</button></div>
          {workspaceCourses.length ? <div className="course-library-grid">{workspaceCourses.map(course => <CourseCard key={course.id} course={course} activity={activity} onOpen={() => openCourse(course.id)} onEdit={() => setAcademicEdit({ course, action: 'edit' })} onMove={() => setAcademicEdit({ course, action: 'move' })}/>)}</div> : <EmptyState title="Aún no hay cursos aquí" text="Crea tu primer curso o abre Espacios para traer uno de otro espacio." action="Crear curso" onClick={() => setShowCourseForm(true)} />}
        </section>}

        {tab === 'cursos' && route.courseId && !route.materialId && <section className="course-page">
          {activeCourse ? <>
            <div className="course-page-hero"><div className="course-page-emoji">{activeCourse.emoji}</div><div><p className="eyebrow">Curso</p><h2>{activeCourse.name}</h2><p>{activeCourse.materials.length} materiales · Cada documento tiene su espacio de aprendizaje.</p></div><button className={route.courseSection === 'materials' ? 'primary' : 'secondary'} onClick={() => startMaterialUpload(activeCourse.id)}>+ Agregar material</button></div>
            <nav className="course-context-nav" aria-label={`Secciones de ${activeCourse.name}`}>{([
              ['overview', 'Resumen'], ['materials', 'Materiales'], ['ai', 'Nexo'], ['library', 'Biblioteca'], ['practice', 'Práctica'], ['progress', 'Progreso'],
            ] as [CourseSection, string][]).map(([section, label]) => <button key={section} className={(route.courseSection ?? 'overview') === section ? 'active' : ''} aria-current={(route.courseSection ?? 'overview') === section ? 'page' : undefined} onClick={() => navigate(courseSectionPath(activeCourse.id, section))}>{label}</button>)}</nav>
            {(route.courseSection === undefined || route.courseSection === 'overview') && <CourseOverview course={activeCourse} activity={activity} memory={memory} sessions={sessions} onOpenMaterial={materialId => openMaterial(activeCourse.id, materialId)} onUpload={() => startMaterialUpload(activeCourse.id)} onRecommend={recommendation => openRecommendation(activeCourse, recommendation)} onCourseAi={() => navigate(courseSectionPath(activeCourse.id, 'ai'))}/>}
            {(route.courseSection === undefined || route.courseSection === 'overview' || route.courseSection === 'materials') && (activeCourse.materials.length ? <><div className="section-head"><h3>{route.courseSection === 'materials' ? 'Todos los materiales' : 'Materiales recientes'}</h3></div><div className="materials-grid course-materials-grid">{[...activeCourse.materials].sort((a, b) => (activity[b.id]?.lastStudiedAt ?? b.createdAt).localeCompare(activity[a.id]?.lastStudiedAt ?? a.createdAt)).slice(0, route.courseSection === 'materials' ? undefined : 3).map(material => <MaterialCard key={material.id} material={material} onOpen={() => openMaterial(activeCourse.id, material.id)} onRename={() => setAcademicEdit({ course: activeCourse, material, action: 'edit' })} onDownload={material.sourceType === 'pdf' && (pdfFiles[material.id] || material.storagePath) ? () => void downloadMaterial(material) : undefined}/>)}</div></> : <EmptyState title="Todavía no hay materiales" text="Agrega un PDF o tus apuntes. Nexo aprende del contenido de este curso." action="Agregar material" onClick={() => startMaterialUpload(activeCourse.id)} />)}
            {route.courseSection === 'ai' && <CourseAiPage key={`${activeCourse.id}:${courseAiSeed?.solution.id ?? "course"}`} seed={courseAiSeed?.solution.courseId === activeCourse.id ? courseAiSeed : undefined} course={activeCourse} memory={memory} activity={activity} onOpenSource={(materialId, page) => { openMaterial(activeCourse.id, materialId); setSourceJump({ materialId, page }) }}/>}
            {route.courseSection === 'library' && <CourseLibrary course={activeCourse} solutions={solutionsByCourse[activeCourse.id] ?? []} loading={solutionsLoading} error={solutionsError} onRetry={() => setSolutionRetry(value => value + 1)} onMaterial={id => openMaterial(activeCourse.id, id)} onSolution={setSelectedSolution} onArtifact={(materialId, artifact) => openArtifact(activeCourse.id, materialId, artifact.id, artifact.type, artifactPage(artifact))}/>}
            {route.courseSection === 'practice' && <CoursePracticePage course={activeCourse} sessions={sessions.filter(session => session.courseId === activeCourse.id)} onPrepare={(minutes, objective) => prepareSession(activeCourse, minutes, objective)} onComplete={completePracticeStep} onOpenActivity={openPracticeActivity}/>}
            {route.courseSection === 'progress' && <ProgressPage workspace={{ id: activeCourse.id, name: activeCourse.name, emoji: activeCourse.emoji, created_at: '' }} courses={[activeCourse]} activity={activity} memory={memory} sessions={sessions.filter(session => session.courseId === activeCourse.id)} onOpenMaterial={openMaterial} onPractice={(courseId, materialId) => navigate(materialStudyPath(courseId, materialId, 'multiple-choice'))} />}
          </> : <EmptyState title="Curso no encontrado" text="Este curso no existe en este dispositivo." action="Volver a cursos" onClick={() => navigate('/courses')} />}
        </section>}

        {tab === 'resolver' && <ResolverPage key={workspaces.selectedId} workspaceId={workspaces.selectedId} initialThreadId={resolverThreadId} onSave={setSolutionDraft} />}
        {tab === 'corrector' && <CorrectorPage key={workspaces.selectedId} />}

        {tab === 'cursos' && route.workspace && activeCourse && activeMaterial && <MaterialWorkspace key={activeMaterial.id} course={activeCourse} material={activeMaterial} localPdf={pdfFiles[activeMaterial.id]} initialPage={sourceJump?.materialId === activeMaterial.id ? sourceJump.page : undefined} onBack={() => navigate(coursePath(activeCourse.id))} onStudy={mode => navigate(materialStudyPath(activeCourse.id, activeMaterial.id, mode))} onRetry={pdfFiles[activeMaterial.id] || activeMaterial.storagePath ? () => void retryPdfMaterial(activeCourse, activeMaterial) : undefined} onAnalyzeMore={pages => analyzeMorePdfPages(activeCourse, activeMaterial, pages)} onVisualAnalysis={(pages, text) => saveVisualAnalysis(activeCourse, activeMaterial, pages, text)} initialArtifactId={sourceJump?.materialId === activeMaterial.id ? sourceJump.artifactId : undefined} onPageArtifact={(page, type) => preparePageArtifact(activeCourse, activeMaterial, page, type)} onRecall={(label, rating) => recordFlashcardRating(activeMaterial.id, label, rating)} onPageReveal={(artifactId, index) => recordActivity(activeMaterial.id, value => ({ ...value, artifactCardsSeen: Array.from(new Set([...(value.artifactCardsSeen ?? []), `${artifactId}:${index}`])) }))} onPageAnswer={(artifactId, label, index, correct) => { recordRecall(activeMaterial.id, label, correct ? 'good' : 'again'); recordActivity(activeMaterial.id, value => ({ ...value, practiceAttempts: { ...value.practiceAttempts, [`page:${artifactId}:${index}`]: correct } })); recordSessionEvent('quiz_answer', activeMaterial.id, { correct }) }}/>}

        {tab === 'cursos' && route.materialStudyMode && !['flashcards', 'multiple-choice'].includes(route.materialStudyMode) && activeCourse && activeMaterial && <StudyMethodPage key={`${activeMaterial.id}:${route.materialStudyMode}`} course={activeCourse} material={activeMaterial} mode={route.materialStudyMode} onBack={() => navigate(activeMaterial.sourceType === 'pdf' ? materialWorkspacePath(activeCourse.id, activeMaterial.id) : materialPath(activeCourse.id, activeMaterial.id))} onGenerate={generateArtifact} onSaveExam={saveExamArtifact} onRecall={(concept, rating) => recordRecall(activeMaterial.id, concept, rating)} onPractice={(type, index, correct) => recordMethodPractice(activeMaterial.id, type, index, correct)}/>}

        {tab === 'cursos' && route.materialId && !route.workspace && (!route.materialStudyMode || ['flashcards', 'multiple-choice'].includes(route.materialStudyMode)) && <section className="course-study-page"><div className="course-study-context"><div><p className="eyebrow">Dentro de {activeCourse?.name ?? 'tu curso'}</p><h2>Estudia este material</h2></div><button className="secondary" onClick={() => activeCourse && navigate(activeMaterial?.sourceType === 'pdf' ? materialWorkspacePath(activeCourse.id, activeMaterial.id) : coursePath(activeCourse.id))}>{activeMaterial?.sourceType === 'pdf' ? '← Volver al PDF' : '← Ver todos los materiales'}</button></div><div className="study-layout">
          <aside className="panel material-nav"><div className="section-head compact"><div><p className="eyebrow">Material</p><h3>{activeCourse?.name ?? 'Curso'}</h3></div></div>{activeCourse?.materials.map(material => <button key={material.id} className={`material-nav-item ${activeMaterial?.id === material.id ? 'active' : ''}`} onClick={() => openMaterial(activeCourse.id, material.id)}><span>{material.sourceType === 'pdf' ? 'P' : '≡'}</span><div><strong>{material.title}</strong><small>{material.studyPackMeta?.source === 'nexo-ai' ? '✦ Preparado por Nexo IA' : material.pages?.length ? `${material.pages.length} páginas` : `${material.text.length} caracteres`}</small></div></button>)}<button className="secondary full" onClick={() => startMaterialUpload(activeCourse?.id)}>+ Agregar material</button></aside>
          <div className="panel study-stage">{pack && activeMaterial ? <>
            <div className="study-heading"><div><p className="eyebrow">Sesión de estudio</p><h2>{activeMaterial.title}</h2>{activeMaterial.sourceName && <small className="source-line">{activeMaterial.sourceType === 'pdf' ? '📄' : '📝'} {activeMaterial.sourceName}</small>}</div><div className="study-heading-actions">{studyMode === 'summary' && <button className="secondary ai-regenerate" disabled={aiGeneratingMaterialId === activeMaterial.id} onClick={regenerateActiveMaterial}>{aiGeneratingMaterialId === activeMaterial.id ? '✦ Preparando…' : '✦ Preparar Study Pack completo'}</button>}{studyMode === 'flashcards' && flashArtifact?.status === 'ready' && <button className="secondary ai-regenerate" onClick={() => generateArtifact('flashcards', true)}>Regenerar tarjetas</button>}{studyMode === 'quiz' && quizArtifact?.status === 'ready' && <button className="secondary ai-regenerate" onClick={() => generateArtifact('multiple_choice', true)}>Regenerar preguntas</button>}<div className="mode-tabs"><button className={studyMode === 'summary' ? 'active' : ''} onClick={() => setStudyMode('summary')}>Resumen</button><button className={studyMode === 'flashcards' ? 'active' : ''} onClick={() => setStudyMode('flashcards')}>Flashcards</button><button className={studyMode === 'quiz' ? 'active' : ''} onClick={() => setStudyMode('quiz')}>Quiz</button><button className={studyMode === 'tutor' ? 'active' : ''} onClick={() => setStudyMode('tutor')}>Tutor</button></div></div></div>
            {aiGeneratingMaterialId === activeMaterial.id && <StudyGenerationBanner material={activeMaterial} />}
            {aiGenerationErrors[activeMaterial.id] && <div className="study-ai-error"><div><strong>No pude completar la preparación con IA.</strong><p>{aiGenerationErrors[activeMaterial.id]} Puedes seguir estudiando con el paquete local o intentarlo otra vez.</p></div><button className="secondary" onClick={regenerateActiveMaterial}>Reintentar</button></div>}
            {studyMode === 'summary' && <SummaryView pack={pack} material={activeMaterial} />}
            {studyMode === 'flashcards' && (activeMaterial.sourceType === 'pdf' && flashArtifact?.status !== 'ready' ? <ArtifactGate name="flashcards" status={flashArtifact?.status} onGenerate={() => generateArtifact('flashcards')} /> : <FlashcardView pack={pack} index={flashIndex} revealed={flashRevealed} setIndex={setFlashIndex} setRevealed={setFlashRevealed} onReveal={index => recordActivity(activeMaterial.id, value => ({ ...value, flashcardsSeen: [...new Set([...(value.flashcardsSeen ?? []), index])] }))} onRate={(index, rating) => recordFlashcardRating(activeMaterial.id, pack.flashcards[index].concept || pack.flashcards[index].front, rating)} />)}
            {studyMode === 'quiz' && (activeMaterial.sourceType === 'pdf' && quizArtifact?.status !== 'ready' ? <ArtifactGate name="preguntas de opción múltiple" status={quizArtifact?.status} onGenerate={() => generateArtifact('multiple_choice')} /> : <QuizView pack={pack} answers={quizAnswers} setAnswers={setQuizAnswers} onAnswer={(index, correct) => recordQuizAnswer(activeMaterial.id, pack.quiz[index].concept || pack.quiz[index].question, index, correct)} />)}
            {studyMode === 'tutor' && <TutorView key={activeMaterial.id} material={activeMaterial} />}
          </> : <EmptyState title="No hay material seleccionado" text="Entra a un curso y agrega un PDF para crear una sesión de estudio." action="Ver cursos" onClick={() => navigate('/courses')} />}</div>
        </div></section>}

        {tab === 'progreso' && <ProgressPage workspace={workspaces.selectedWorkspace} courses={workspaceCourses} activity={activity} memory={memory} sessions={sessions.filter(session => workspaceCourses.some(course => course.id === session.courseId))} onOpenMaterial={openMaterial} onPractice={(courseId, materialId) => navigate(materialStudyPath(courseId, materialId, 'multiple-choice'))} />}
        </Suspense>
      </main>

      <Suspense fallback={<p role="status" className="utility-loading">Abriendo…</p>}>

      {showGlobalSearch && <GlobalSearch userId={user.id} workspaceId={workspaces.selectedId} courses={courses} onArtifact={(...args) => { setShowGlobalSearch(false); openArtifact(...args) }} onConversation={id => { setShowGlobalSearch(false); setResolverThreadId(id); setTab('resolver') }} onClose={() => setShowGlobalSearch(false)} onCourse={id => { setShowGlobalSearch(false); openCourse(id) }} onMaterial={(courseId, materialId, page) => { setShowGlobalSearch(false); openMaterial(courseId, materialId); if (page) setSourceJump({ materialId, page }) }} onSolution={(id, courseId) => { setShowGlobalSearch(false); void openSavedSolution(id, courseId) }} onUpload={() => { setShowGlobalSearch(false); startMaterialUpload() }} onResolver={() => { setShowGlobalSearch(false); setTab('resolver') }}/>}
      {solutionDraft && <SaveSolutionDialog courses={courses} draft={solutionDraft} onClose={() => setSolutionDraft(null)} onCreateCourse={name => createCourse(name, '📘', true)} onSave={async (course, draft) => { await saveCourses(user.id, [{ ...course, materials: [] }]); return saveSolution(user.id, course.id, draft) }} onSaved={solution => { setSolutionDraft(null); setSolutionsByCourse(current => ({ ...current, [solution.courseId]: [solution, ...(current[solution.courseId] ?? []).filter(item => item.id !== solution.id)] })); navigate(courseSectionPath(solution.courseId, 'library')); setSelectedSolution(solution) }}/>}
      {selectedSolution && courses.some(course => course.id === selectedSolution.courseId) && <SavedSolutionDialog solution={selectedSolution} course={courses.find(course => course.id === selectedSolution.courseId)!} onClose={() => setSelectedSolution(null)} onDeleted={() => { setSolutionsByCourse(current => ({ ...current, [selectedSolution.courseId]: (current[selectedSolution.courseId] ?? []).filter(item => item.id !== selectedSolution.id) })); setSelectedSolution(null) }} onAsk={askSavedSolution}/>}
      {academicEdit && <AcademicItemDialog item={academicEdit} workspaces={[{ id: GENERAL_WORKSPACE, name: 'General', emoji: '🏠', created_at: '' }, ...workspaces.folders]} currentWorkspace={workspaceForCourse(academicEdit.course.id, workspaces.memberships)} onClose={() => setAcademicEdit(null)} onSave={async (name, emoji, workspaceId) => {
        if (academicEdit.action === 'move') { await workspaces.moveCourse(academicEdit.course.id, workspaceId); workspaces.setSelectedId(workspaceId); navigate('/courses'); return }
        const course = courses.find(course => course.id === academicEdit.course.id)
        if (!course) throw new Error('Course missing')
        const next = academicEdit.material ? { ...course, materials: course.materials.map(material => material.id === academicEdit.material!.id ? { ...material, title: name } : material) } : { ...course, name, emoji }
        if (remoteEnabled) {
          if (academicEdit.material) await renameMaterial(user.id, course.id, academicEdit.material.id, name)
          else await saveCourses(user.id, [{ ...next, materials: [] }])
        }
        setCourses(current => current.map(course => course.id !== next.id ? course : academicEdit.material ? { ...course, materials: course.materials.map(material => material.id === academicEdit.material!.id ? { ...material, title: name } : material) } : { ...course, name, emoji }))
      }}/>}
      {utility === 'feedback' && <FeedbackDialog context={pathname} onClose={() => setUtility(null)}/>}
      {utility && !['feedback', 'admin', 'logout'].includes(utility) && <AccountUtilities key={utility} mode={utility} identity={identity} userId={user.id} onClose={() => setUtility(null)} onName={onName} collapsed={sidebarCollapsed} onCollapsed={setSidebarCollapsed} reducedMotion={reducedMotion} onReducedMotion={setReducedMotion} remoteEnabled={remoteEnabled} onRetry={retrySynchronization}/>}
      {showCourseForm && <Modal title={`Nuevo curso · ${workspaces.selectedWorkspace.name}`} onClose={() => { setShowCourseForm(false); setResumeUploadAfterCourse(false) }}><div className="course-emoji-preview"><span>{courseEmoji}</span><div><strong>Un curso para {workspaces.selectedWorkspace.name}</strong><small>Quedará dentro de este espacio y su avance se medirá aquí.</small></div></div><div className="course-emoji-picker">{['📘','🧠','🧪','🩺','🦷','📐','⚛️','💻','📚','🌎','⚖️','💹','🧬','🔬','🎨','🎯'].map(emoji => <button key={emoji} className={courseEmoji === emoji ? 'active' : ''} onClick={() => setCourseEmoji(emoji)}>{emoji}</button>)}</div><label>Nombre del curso<input autoFocus value={courseName} onChange={e => setCourseName(e.target.value)} placeholder="Ej. Histología" onKeyDown={e => e.key === 'Enter' && addCourse()} /></label>{courseError && <div role="alert" className="auth-alert error">{courseError}</div>}<div className="modal-actions"><button className="secondary" onClick={() => { setShowCourseForm(false); setResumeUploadAfterCourse(false) }}>Cancelar</button><button className="primary" disabled={courseBusy || !courseName.trim()} onClick={addCourse}>{courseBusy ? 'Creando…' : 'Crear curso'}</button></div></Modal>}

      {showMaterialForm && <Modal title="Agregar material" onClose={() => { setShowMaterialForm(false); resetMaterialForm() }} wide>
        {!uploadCourseId || !courses.some(course => course.id === uploadCourseId) ? <div className="upload-course-step">
          <p className="eyebrow">Paso 1 · Elige un curso</p><h3>¿Dónde quieres guardarlo?</h3>
          <div className="upload-course-list">{courses.map(course => <button key={course.id} className="secondary" onClick={() => setUploadCourseId(course.id)}>{course.emoji} {course.name}</button>)}</div>
          <button className="text-button" onClick={() => { setResumeUploadAfterCourse(true); setShowMaterialForm(false); setShowCourseForm(true) }}>+ Crear nuevo curso</button>
        </div> : <div className="upload-material-step">
          <p className="eyebrow">Paso 2 · Material para {courses.find(course => course.id === uploadCourseId)?.name}</p>
          {!route.courseId && <button className="text-button" onClick={() => { resetMaterialForm(); setUploadCourseId('') }}>← Cambiar curso</button>}
          <div className="upload-box"><input id="file-upload" type="file" accept=".txt,.md,.pdf" onChange={e => void importFile(e.target.files?.[0])}/><label htmlFor="file-upload"><span>↑</span><strong>{pendingUploadFile ? pendingUploadFile.name : 'Elegir PDF, TXT o MD'}</strong><small>Hasta 25 MB por PDF. Revisa el título antes de guardar.</small></label></div>
          {!pendingUploadFile && <button className="text-button" onClick={() => setManualDraft(true)}>Escribir apuntes sin archivo</button>}
          {(pendingUploadFile || manualDraft) && <><label>Título para mostrar<input value={materialTitle} onChange={e => setMaterialTitle(e.target.value)} placeholder="Ej. Clase 04 — Patología oral" /></label>
            {manualDraft && <label>Apuntes<textarea rows={5} value={materialText} onChange={e => setMaterialText(e.target.value)} placeholder="Escribe o pega tus apuntes…" /></label>}</>}
          {importStatus && <div className={`import-status ${importStatus.startsWith('⚠') ? 'error' : ''}`}>{importStatus}</div>}
          <div className="modal-actions"><button className="secondary" onClick={() => { setShowMaterialForm(false); resetMaterialForm() }}>Cancelar</button><button className="primary" disabled={!materialTitle.trim() || (!pendingUploadFile && !materialText.trim()) || (pendingUploadFile !== null && !/\.pdf$/i.test(pendingUploadFile.name) && !materialText.trim())} onClick={() => void addMaterial()}>Guardar y abrir material</button></div>
        </div>}
      </Modal>}
      </Suspense>
    </div>
  )
}

function NavButton({ icon, label, active, onClick }: { icon: string; label: string; active: boolean; onClick: () => void }) { return <button className={`nav-button ${active ? 'active' : ''}`} title={label} aria-label={label} aria-current={active ? 'page' : undefined} onClick={onClick}><Icon name={icon}/><span className="nav-label">{label}</span></button> }
function Stat({ label, value, hint }: { label: string; value: string; hint: string }) { return <div className="stat-card"><p>{label}</p><strong>{value}</strong><small>{hint}</small></div> }

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
    ? quickSummaryFor(material) : ''
  return <div className="study-content"><div className="ai-note"><span>{ai ? '✦' : '⚙'}</span><div><strong>{ai ? 'Preparado por Nexo IA' : 'Paquete local de respaldo'}</strong><p>{ai ? `Generado para un enfoque ${material.studyPackMeta?.focus || 'equilibrado'}${material.studyPackMeta?.sampledPages?.length ? ` · ${material.studyPackMeta.sampledPages.length} páginas muestreadas` : ''}.` : 'Este material sigue disponible aunque la generación con IA todavía no se haya completado.'}</p></div></div>{!ai && minimumSummary && <div className="material-minimum-summary"><strong>Vista rápida del material</strong><p>{minimumSummary}</p></div>}<div className="keyword-row">{pack.keywords.slice(0, 10).map(k => <span key={k}>{k}</span>)}</div><div className="summary-list">{pack.summary.map((item, index) => <div key={index}><span>{String(index + 1).padStart(2, '0')}</span><p>{item.replace(/\.$/, '')}.</p></div>)}</div></div>
}

function TutorView({ material }: { material: Material }) {
  const [question, setQuestion] = useState('')
  const [history, setHistory] = useState<{ q: string; a: TutorAnswer }[]>([])
  const ask = () => { const q = question.trim(); if (!q) return; setHistory(prev => [...prev, { q, a: askMaterial(material, q) }]); setQuestion('') }
  return <div className="tutor-wrap"><div className="ai-note"><span>🧠</span><div><strong>Tutor del material</strong><p>Busca evidencia dentro del documento y conserva referencias de página cuando están disponibles.</p></div></div><div className="tutor-chat">{history.length === 0 && <div className="tutor-empty"><span>✦</span><p>Prueba: “¿Qué función tiene…?”, “¿Cuál es la diferencia entre…?” o escribe un concepto del PDF.</p></div>}{history.map((item, i) => <div className="chat-turn" key={i}><div className="user-bubble">{item.q}</div><div className="tutor-bubble"><div className="confidence">Confianza {item.a.confidence}</div><p>{item.a.answer}</p>{item.a.citations.length > 0 && <div className="citations">{item.a.citations.map((c, j) => <div key={j}><strong>{c.page ? `Página ${c.page}` : 'Material'}</strong><span>{c.excerpt}</span></div>)}</div>}</div></div>)}</div><div className="tutor-input"><textarea rows={2} value={question} onChange={e => setQuestion(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask() } }} placeholder="Pregunta algo sobre este material…"/><button className="primary" onClick={ask}>Preguntar</button></div></div>
}

function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) { return <Dialog title={title} onClose={onClose} className={`modal ${wide ? 'wide-modal' : ''}`}><div className="modal-head"><h2>{title}</h2><button aria-label="Cerrar diálogo" onClick={onClose}>×</button></div>{children}</Dialog> }
function tabTitle(tab: AppTab) { return ({ inicio: 'Inicio', cursos: 'Mis cursos', resolver: 'Resolver con Nexo IA', corrector: 'Corrector de trabajos', progreso: 'Tu progreso' } as const)[tab] }
export default App
