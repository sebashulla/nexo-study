import { Fragment, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { Course, StudyArtifactType } from './types'
import { searchAcademicTopics, searchSavedSolutions, searchStudyArtifacts } from './lib/learningRepository'
import { artifactPage } from './lib/artifactScope'
import { displayMaterialTitle } from './lib/materialTitles'
import { getThread, searchThreads } from './lib/conversationRepository'
import type { ConversationThread } from './lib/conversationTypes'
import { Dialog } from './Dialog'

type Hit = { id: string; group: string; title: string; detail: string; courseId?: string; materialId?: string; page?: number; type?: StudyArtifactType; concept?: string; workspaceId?: string; conversation?: ConversationThread }
type TopicHit = { courseId: string; materialId: string; title: string; page: number }
const labels: Record<StudyArtifactType, string> = { summary: 'Resumen', flashcards: 'Flashcards', multiple_choice: 'Opción múltiple', written_questions: 'Preguntas escritas', fill_blanks: 'Completar espacios', notes: 'Apuntes', exam: 'Simulacro' }
const normalized = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const historyKey = (userId: string) => `nexo-search-recent-v1:${userId}`
function savedHits(userId: string): Hit[] {
  try { const value: unknown = JSON.parse(localStorage.getItem(historyKey(userId)) ?? '[]'); return Array.isArray(value) ? value.filter((item): item is Hit => item && typeof item.id === 'string' && typeof item.title === 'string' && typeof item.group === 'string' && typeof item.detail === 'string').slice(0, 8) : [] } catch { return [] }
}

export function GlobalSearch({ userId, workspaceId, courses, onClose, onCourse, onMaterial, onSolution, onArtifact, onConversation, onUpload, onResolver }: {
  userId: string; workspaceId: string; courses: Course[]; onClose: () => void; onCourse: (id: string) => void
  onMaterial: (courseId: string, materialId: string, page?: number) => void; onSolution: (id: string, courseId: string) => void
  onArtifact: (courseId: string, materialId: string, id: string, type: StudyArtifactType, page?: number, concept?: string) => void
  onConversation: (thread: ConversationThread) => void; onUpload: () => void; onResolver: () => void
}) {
  const [query, setQuery] = useState('')
  const [remoteTopics, setRemoteTopics] = useState<TopicHit[]>([])
  const [solutions, setSolutions] = useState<{ id: string; courseId: string; question: string }[]>([])
  const [artifacts, setArtifacts] = useState<Awaited<ReturnType<typeof searchStudyArtifacts>>>([])
  const [searchError, setSearchError] = useState('')
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState(0)
  const resultsRef = useRef<HTMLDivElement>(null)
  const resultId = useId()
  const term = normalized(query.trim())
  const [recentThreads, setRecentThreads] = useState<ConversationThread[]>([])
  const [remoteReady, setRemoteReady] = useState(false)
  const [remoteConversations, setRemoteConversations] = useState<ConversationThread[]>([])
  const localConversations = useMemo(() => {
    try { const value = JSON.parse(localStorage.getItem(`nexo-conversations-v1:${userId}:general:${workspaceId}`) ?? '{}'); return (value.threads ?? []).filter((thread: ConversationThread) => !thread.archivedAt) as ConversationThread[] } catch { return [] }
  }, [userId, workspaceId])
  const conversations = [...new Map([...(remoteReady ? [] : localConversations), ...recentThreads, ...remoteConversations].map(thread => [thread.id, thread])).values()]
  const courseIds = useMemo(() => courses.map(course => course.id), [courses])
  useEffect(() => {
    let live = true
    void Promise.allSettled(savedHits(userId).filter(hit => hit.group === 'Conversaciones').map(hit => getThread(userId, hit.id))).then(results => {
      if (live) setRecentThreads(results.flatMap(result => result.status === 'fulfilled' && result.value && !result.value.archivedAt &&
        (result.value.scope === 'general' ? result.value.workspaceId === workspaceId : courseIds.includes(result.value.courseId ?? '')) ? [result.value] : []))
    })
    return () => { live = false }
  }, [userId, workspaceId, courseIds])
  const materialIds = useMemo(() => term ? courses.flatMap(course => course.materials.filter(material => normalized(material.title).includes(term)).map(material => material.id)) : [], [courses, term])
  const types = useMemo(() => (Object.keys(labels) as StudyArtifactType[]).filter(type => normalized(`${labels[type]} ${type}`).includes(term)), [term])
  useEffect(() => {
    setRemoteReady(false); setSelected(0); setRemoteTopics([]); setSolutions([]); setArtifacts([]); setSearchError('')
    if (query.trim().length < 2) { setSearching(false); return }
    setSearching(true)
    let live = true
    const timer = window.setTimeout(() => {
      void Promise.allSettled([searchAcademicTopics(userId, query), searchSavedSolutions(userId, query), searchStudyArtifacts(userId, types, materialIds), searchThreads(userId, query, workspaceId, courseIds)]).then(([topics, saved, resources, threads]) => {
        if (!live) return
        setRemoteTopics(topics.status === 'fulfilled' ? topics.value : [])
        setSolutions(saved.status === 'fulfilled' ? saved.value : [])
        setArtifacts(resources.status === 'fulfilled' ? resources.value : [])
        setRemoteReady(threads.status === 'fulfilled'); setRemoteConversations(threads.status === 'fulfilled' ? threads.value : [])
        setSearchError([topics, saved, resources, threads].some(result => result.status === 'rejected') ? 'Parte de la búsqueda remota no está disponible. Puedes usar los resultados locales.' : '')
        setSearching(false)
      })
    }, 250)
    return () => { live = false; window.clearTimeout(timer) }
  }, [query, userId, materialIds, types, workspaceId, courseIds])
  const hits: Hit[] = []
  const valid = (hit: Hit) => {
    if (hit.group === 'Conversaciones') return recentThreads.some(thread => thread.id === hit.id)
    const course = courses.find(course => course.id === hit.courseId)
    return !!course && (!hit.materialId || course.materials.some(material => material.id === hit.materialId))
  }
  if (!term) hits.push(...savedHits(userId).filter(valid))
  else {
    hits.push(...courses.filter(course => normalized(course.name).includes(term)).slice(0, 6).map(course => ({ id: course.id, group: 'Cursos', title: `${course.emoji} ${course.name}`, detail: `${course.materials.length} materiales`, courseId: course.id })))
    for (const course of courses) for (const material of course.materials) {
      if (normalized(`${material.title} ${material.sourceName ?? ''}`).includes(term)) hits.push({ id: material.id, group: 'Materiales', title: displayMaterialTitle(material.title), detail: course.name, courseId: course.id, materialId: material.id })
      for (const topic of material.topics ?? []) if (normalized(topic.title).includes(term)) hits.push({ id: `topic:${material.id}:${topic.pageStart}:${topic.title}`, group: 'Temas', title: topic.title, detail: `${course.name} · pág. ${topic.pageStart ?? 1}`, courseId: course.id, materialId: material.id, page: topic.pageStart ?? 1 })
      for (const artifact of material.artifacts ?? []) if (artifact.status === 'ready' && (types.includes(artifact.type) || materialIds.includes(material.id))) hits.push({ id: artifact.id, group: 'Recursos', title: labels[artifact.type], detail: material.title, courseId: course.id, materialId: material.id, type: artifact.type, page: artifactPage(artifact) })
    }
    for (const topic of remoteTopics) if (courses.some(course => course.id === topic.courseId && course.materials.some(material => material.id === topic.materialId))) hits.push({ id: `topic:${topic.materialId}:${topic.page}:${topic.title}`, group: 'Temas', detail: `pág. ${topic.page}`, ...topic })
    hits.push(...solutions.filter(solution => courses.some(course => course.id === solution.courseId)).map(solution => ({ id: solution.id, group: 'Soluciones', title: solution.question, detail: courses.find(course => course.id === solution.courseId)!.name, courseId: solution.courseId })))
    for (const artifact of artifacts) {
      const course = courses.find(course => course.id === artifact.courseId)
      const material = course?.materials.find(material => material.id === artifact.materialId)
      if (course && material) hits.push({ ...artifact, group: 'Recursos', title: labels[artifact.type], detail: `${material.title}${artifact.page ? ` · pág. ${artifact.page}` : ''}` })
    }
    hits.push(...conversations.filter(thread => normalized(thread.title).includes(term)).slice(0, 6).map(thread => ({ id: thread.id, group: 'Conversaciones', title: thread.title, detail: thread.scope === 'general' ? 'Resolver · espacio actual' : `${courses.find(course => course.id === thread.courseId)?.name ?? 'Curso'}${thread.materialId ? ' · material' : ''}`, workspaceId: thread.workspaceId, conversation: thread })))
  }
  const order = ['Cursos', 'Materiales', 'Temas', 'Soluciones', 'Conversaciones', 'Recursos']
  const results = hits.filter((hit, index, all) => all.findIndex(other => other.id === hit.id && other.group === hit.group) === index).sort((a, b) => term ? order.indexOf(a.group) - order.indexOf(b.group) : 0).slice(0, 40)
  const active = Math.min(selected, Math.max(0, results.length - 1))
  const open = (hit: Hit) => {
    try { localStorage.setItem(historyKey(userId), JSON.stringify([hit, ...savedHits(userId).filter(item => item.id !== hit.id || item.group !== hit.group)].slice(0, 8))) } catch { /* Search still works without local history. */ }
    if (hit.group === 'Cursos') onCourse(hit.courseId!)
    else if (hit.group === 'Soluciones') onSolution(hit.id, hit.courseId!)
    else if (hit.group === 'Conversaciones') { const thread = conversations.find(item => item.id === hit.id) ?? hit.conversation; if (thread) onConversation(thread) }
    else if (hit.group === 'Recursos') onArtifact(hit.courseId!, hit.materialId!, hit.id, hit.type!, hit.page, hit.concept)
    else onMaterial(hit.courseId!, hit.materialId!, hit.page)
  }
  return <Dialog title="Buscar en Nexo Study" onClose={onClose} className="global-search-dialog">
    <div className="search-palette-head"><strong>Buscar en Nexo</strong><button aria-label="Cerrar búsqueda" onClick={onClose}>×</button></div>
    <div className="global-search"><input autoFocus aria-label="Buscar en Nexo Study" aria-controls={resultId} aria-expanded="true" role="combobox" aria-autocomplete="list" aria-activedescendant={results.length ? `${resultId}-${active}` : undefined} value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar en Nexo…" onKeyDown={event => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); const next = (active + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % Math.max(1, results.length); setSelected(next); resultsRef.current?.querySelector(`#${CSS.escape(`${resultId}-${next}`)}`)?.scrollIntoView({ block: 'nearest' }) }
      if (event.key === 'Enter' && results[active]) { event.preventDefault(); open(results[active]) }
    }}/>
      <div className="global-search-results" ref={resultsRef} id={resultId} role="listbox" aria-label="Resultados de búsqueda" aria-busy={searching}>
        {results.map((hit, index) => <Fragment key={`${hit.group}:${hit.id}`}>
          {(index === 0 || term && results[index - 1].group !== hit.group) && <p className="eyebrow" role="presentation">{term ? hit.group : 'Reciente'}</p>}
          <button id={`${resultId}-${index}`} role="option" aria-selected={active === index} onMouseMove={() => setSelected(index)} onClick={() => open(hit)}><span>{!term ? `${hit.group} · ` : ''}{hit.detail}</span><strong>{hit.title}</strong></button>
        </Fragment>)}
      </div>
      {!term && <div className="search-quick-actions"><p className="eyebrow">Acciones rápidas</p><button className="text-button" onClick={onUpload}>＋ Subir material</button><button className="text-button" onClick={onResolver}>✦ Resolver</button></div>}
      {searching && <p role="status">Buscando…</p>}{searchError && <p role="status">{searchError}</p>}
      {term && !searching && !results.length && <div className="search-empty"><strong>No encontramos coincidencias</strong><p>Prueba con otro tema, material o nombre de curso.</p></div>}
      <p className="search-keyboard-hint"><kbd>↑ ↓</kbd> elegir · <kbd>Enter</kbd> abrir · <kbd>Escape</kbd> cerrar</p>
    </div>
  </Dialog>
}
