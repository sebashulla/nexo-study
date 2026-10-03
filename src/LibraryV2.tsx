import { useEffect, useMemo, useState } from 'react'
import type { Course, SavedSolution, StudyArtifact } from './types'
import type { ConversationThread } from './lib/conversationTypes'
import { searchThreads } from './lib/conversationRepository'
import { searchAcademicTopics } from './lib/learningRepository'
import { sourceDescription, sourceLabels, sourceReference } from './lib/sourceModel'
import { artifactConcept, artifactPage } from './lib/artifactScope'
import { displayMaterialTitle } from './lib/materialTitles'

const filters = ['Todos','PDF','Documentos','Imágenes','Web','YouTube','Apuntes','Flashcards','Prácticas','Soluciones'] as const
type Filter = typeof filters[number]
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
const artifactLabel = { summary:'Resumen',flashcards:'Flashcards',multiple_choice:'Opción múltiple',written_questions:'Preguntas escritas',fill_blanks:'Completar espacios',notes:'Apuntes estructurados',exam:'Simulacro' }
export function LibraryV2({ courses, userId, workspaceId, solutions, loading, error, onRetry, onAdd, onMaterial, onArtifact, onSolution, onConversation }: {
  courses: Course[]; userId: string; workspaceId: string; solutions: SavedSolution[]; loading?: boolean; error?: string; onRetry: () => void; onAdd: () => void;
  onMaterial: (courseId: string,materialId: string,page?: number) => void; onArtifact: (courseId: string,materialId: string,artifact: StudyArtifact) => void;
  onSolution: (solution: SavedSolution) => void; onConversation: (thread: ConversationThread) => void
}) {
  const [filter,setFilter] = useState<Filter>('Todos'), [query,setQuery] = useState(''), [filtersOpen,setFiltersOpen] = useState(false), [archived,setArchived] = useState(false)
  const [threads,setThreads] = useState<ConversationThread[]>([]), [topics,setTopics] = useState<Awaited<ReturnType<typeof searchAcademicTopics>>>([]), [searchError,setSearchError] = useState('')
  const courseIds = useMemo(() => courses.map(course => course.id),[courses])
  useEffect(() => {
    setThreads([]); setTopics([]); setSearchError('')
    if (query.trim().length < 2) return
    let live = true
    const timer = window.setTimeout(() => { void Promise.allSettled([searchThreads(userId,query,workspaceId,courseIds),searchAcademicTopics(userId,query)]).then(([conversations,subjects]) => {
      if (!live) return
      setThreads(conversations.status === 'fulfilled' ? conversations.value : [])
      setTopics(subjects.status === 'fulfilled' ? subjects.value.filter(item => courseIds.includes(item.courseId)) : [])
      if (conversations.status === 'rejected' || subjects.status === 'rejected') setSearchError('Parte de la búsqueda remota no está disponible. Se muestran las coincidencias locales.')
    }) },250)
    return () => { live=false; clearTimeout(timer) }
  },[query,userId,workspaceId,courseIds])
  const term = normalize(query.trim())
  const entries: { id: string; title: string; detail: string; kind: string; at: string; open: () => void }[]=[]
  const matches = (value: string) => !term || normalize(value).includes(term)
  for (const course of courses) for (const material of course.materials) {
    if (material.deletionPending || Boolean(material.archivedAt) !== archived) continue
    const type = material.sourceType ?? 'text'
    const materialMatch = matches(`${material.title} ${course.name} ${sourceLabels[type]} ${(material.topics ?? []).map(item => item.title).join(' ')}`)
    const filterMatch = filter === 'Todos' || filter === 'PDF' && type === 'pdf' || filter === 'Documentos' && ['docx','pptx','text'].includes(type) || filter === 'Imágenes' && type === 'image' || filter === 'Web' && type === 'web' || filter === 'YouTube' && type === 'youtube' || filter === 'Apuntes' && type === 'note'
    if (materialMatch && filterMatch) entries.push({id:material.id,title:displayMaterialTitle(material.title),detail:`${course.name} · ${sourceDescription(material)}${material.processingStatus === 'failed' ? ' · Error: abre para reintentar' : material.processingStatus === 'processing' || material.processingStatus === 'queued' ? ' · Preparando…' : material.analysisStatus === 'partial' ? ' · Parcial' : ''}`,kind:'Material',at:material.createdAt,open:() => onMaterial(course.id,material.id)})
    const latest = new Map<string,StudyArtifact>()
    for (const artifact of material.artifacts ?? []) {
      if (artifact.status !== 'ready') continue
      const key = `${artifact.type}:${artifactPage(artifact) ?? ''}:${artifactConcept(artifact) ?? ''}`
      if (!latest.has(key) || latest.get(key)!.version < artifact.version) latest.set(key,artifact)
    }
    for (const artifact of latest.values()) {
      const practice = ['multiple_choice','written_questions','fill_blanks','exam'].includes(artifact.type)
      if (!(filter === 'Todos' || filter === 'Flashcards' && artifact.type === 'flashcards' || filter === 'Prácticas' && practice || filter === 'Apuntes' && artifact.type === 'notes')) continue
      if (!materialMatch && !matches(`${artifactLabel[artifact.type]} ${artifactConcept(artifact) ?? ''}`)) continue
      const unit = artifactPage(artifact)
      entries.push({id:artifact.id,title:artifactConcept(artifact) ? `Práctica · ${artifactConcept(artifact)}` : artifactLabel[artifact.type],detail:`${material.title} · ${course.name}${unit ? ` · ${sourceReference(material,unit)}` : ''}`,kind:'Recurso',at:artifact.updatedAt,open:() => onArtifact(course.id,material.id,artifact)})
    }
  }
  if (!archived && ['Todos','Soluciones'].includes(filter)) for (const solution of solutions) {
    const course = courses.find(item => item.id === solution.courseId)
    if (course && matches(`${solution.question} ${course.name} Solución`)) entries.push({id:solution.id,title:solution.question,detail:course.name,kind:'Solución',at:solution.updatedAt,open:() => onSolution(solution)})
  }
  if (term && filter === 'Todos' && !archived) {
    for (const thread of threads) entries.push({id:thread.id,title:thread.title,detail:thread.scope === 'general' ? 'Resolver' : courses.find(item => item.id === thread.courseId)?.name ?? 'Curso',kind:'Conversación',at:thread.updatedAt,open:() => onConversation(thread)})
    const localTopics = courses.flatMap(course => course.materials.filter(m => !m.archivedAt).flatMap(material => (material.topics ?? []).filter(topic => matches(topic.title)).map(topic => ({courseId:course.id,materialId:material.id,title:topic.title,page:topic.pageStart ?? 1}))))
    for (const topic of [...new Map([...localTopics,...topics].map(item => [`${item.materialId}:${item.title}`,item])).values()]) {
      const course = courses.find(item => item.id === topic.courseId), material = course?.materials.find(item => item.id === topic.materialId)
      if (course && material && !material.archivedAt) entries.push({id:`topic:${material.id}:${topic.title}`,title:topic.title,detail:`${material.title} · ${sourceReference(material,topic.page)}`,kind:'Tema',at:material.createdAt,open:() => onMaterial(course.id,material.id,topic.page)})
    }
  }
  entries.sort((a,b) => b.at.localeCompare(a.at))
  return <section className="library-v2"><header><div><p className="eyebrow">Todo lo que creas para estudiar</p><h2>Biblioteca</h2><p>Materiales, apuntes y prácticas, con su curso de origen.</p></div><button className="primary" onClick={onAdd}>＋ Agregar material</button></header>
    <input className="library-search" aria-label="Buscar en biblioteca" value={query} onChange={event => setQuery(event.target.value)} placeholder="Título, curso, tema o tipo…"/>
    <button className="secondary library-filter-toggle" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(value => !value)}>Filtros · {filter}</button>
    <div className={`library-filters-v2 ${filtersOpen ? 'open' : ''}`} role="group" aria-label="Filtrar biblioteca">{filters.map(item => <button key={item} className="secondary" aria-pressed={filter === item} onClick={() => { setFilter(item); setFiltersOpen(false) }}>{item}</button>)}</div>
    <label className="source-archive-note"><input type="checkbox" checked={archived} onChange={event => setArchived(event.target.checked)}/> Ver materiales archivados</label>
    {loading && <p role="status">Cargando recursos guardados…</p>}{error && <p role="alert">{error} <button className="text-button" onClick={onRetry}>Reintentar</button></p>}{searchError && <p role="status">{searchError}</p>}
    <p className="library-count">{entries.length} resultados</p><div className="library-entries">{entries.map(item => <button key={`${item.kind}:${item.id}`} className="library-entry" onClick={item.open}><span>{item.kind}</span><strong>{item.title}</strong><small>{item.detail}</small></button>)}</div>
    {!entries.length && !loading && <p className="utility-note">{term ? 'No encontramos coincidencias. Prueba con otro título o tema.' : archived ? 'No hay materiales archivados.' : 'Agrega un material y prepara recursos cuando los necesites.'}</p>}
  </section>
}
