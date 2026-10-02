import type { Course, Material, MaterialChunk, MaterialTopic, SavedSolution, SolutionAttachment, SolutionDraft, StudyArtifact, StudyArtifactType, StudySession, StudySessionEvent } from '../types'
import type { StudyActivity } from './studyProgress'
import type { LearningMemory } from './learningState'
import { supabase } from './supabase'

export async function searchStudyArtifacts(userId: string, types: StudyArtifactType[], materialIds: string[]) {
  if (!supabase || (!types.length && !materialIds.length)) return []
  let query = supabase.from('study_artifacts').select('id,course_id,source_material_id,type,scope:payload->scope')
    .eq('user_id', userId).eq('status', 'ready').order('updated_at', { ascending: false }).limit(20)
  query = types.length ? query.in('type', types) : query.in('source_material_id', materialIds)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map(row => ({ id: row.id as string, courseId: row.course_id as string, materialId: row.source_material_id as string,
    type: row.type as StudyArtifactType, page: row.scope && typeof row.scope === 'object' && !Array.isArray(row.scope) && typeof row.scope.page === 'number' ? row.scope.page : undefined }))
}

export async function renameMaterial(userId: string, courseId: string, materialId: string, title: string) {
  if (!supabase) throw new Error('Nexo no está conectado con tu cuenta.')
  const { data, error } = await supabase.from('materials').update({ title }).eq('user_id', userId).eq('course_id', courseId).eq('id', materialId).select('id').single()
  if (error || !data) throw error ?? new Error('No pudimos encontrar este material.')
}

type CourseRow = { id: string; name: string; emoji: string }
type MaterialRow = {
  id: string; course_id: string; title: string; content?: string; source_type: 'text' | 'pdf';
  source_name: string | null; pages?: unknown; page_count: number | null; storage_path: string | null;
  metadata: unknown; document_kind: Material['documentKind']; analysis_status: Material['analysisStatus']; analyzed_pages: number[] | null;
  processing_status: Material['processingStatus']; study_pack?: Material['studyPack'] | null;
  study_pack_meta?: Material['studyPackMeta'] | null; created_at: string
}

function validPages(value: unknown): Material['pages'] {
  return Array.isArray(value) && value.every(page => page && typeof page.page === 'number' && typeof page.text === 'string') ? value : undefined
}

function mapMaterial(row: MaterialRow): Material {
  const metadata = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
    ? row.metadata as Record<string, unknown> : {}
  return {
    id: row.id, title: row.title, text: row.content ?? '', createdAt: row.created_at,
    sourceType: row.source_type, sourceName: row.source_name ?? undefined,
    pages: validPages(row.pages), pageCount: row.page_count ?? undefined,
    pdfBytes: typeof metadata.byteSize === 'number' ? metadata.byteSize : undefined,
    pdfTitle: typeof metadata.title === 'string' ? metadata.title : undefined,
    pdfAuthor: typeof metadata.author === 'string' ? metadata.author : undefined,
    documentKind: row.document_kind ?? undefined, analysisStatus: row.analysis_status ?? undefined,
    analyzedPages: Array.isArray(row.analyzed_pages) ? row.analyzed_pages : undefined,
    storagePath: row.storage_path ?? undefined, processingStatus: row.processing_status ?? undefined,
    studyPack: row.study_pack ?? undefined, studyPackMeta: row.study_pack_meta ?? undefined,
  }
}

export async function synchronizeCourses(userId: string, local: Course[]): Promise<{ courses: Course[]; activity: StudyActivity; memory: LearningMemory; sessions: StudySession[] }> {
  if (!supabase) throw new Error('Nexo no está conectado con tu cuenta.')
  const [courseResult, materialResult] = await Promise.all([
    supabase.from('courses').select('id,name,emoji').eq('user_id', userId),
    supabase.from('materials').select('id,course_id,title,source_type,source_name,page_count,metadata,document_kind,analysis_status,analyzed_pages,storage_path,processing_status,created_at').eq('user_id', userId),
  ])
  const error = courseResult.error || materialResult.error
  if (error) throw error
  const rows = (courseResult.data ?? []) as CourseRow[]
  const materialRows = (materialResult.data ?? []) as MaterialRow[]
  const remote: Course[] = rows.map(row => ({
    id: row.id, name: row.name, emoji: row.emoji,
    materials: materialRows.filter(material => material.course_id === row.id).map(material => ({ ...mapMaterial(material), remotePlaceholder: true })),
  }))
  const localById = new Map(local.map(course => [course.id, course]))
  const missing: Course[] = []
  const courses = remote.map(course => {
    const localCourse = localById.get(course.id)
    const remoteMaterialIds = new Set(course.materials.map(material => material.id))
    const localMaterials = localCourse?.materials.filter(material => !remoteMaterialIds.has(material.id)) ?? []
    if (localMaterials.length) missing.push({ ...course, materials: localMaterials })
    const mergedMaterials = course.materials.map(material => {
      const localMaterial = localCourse?.materials.find(item => item.id === material.id)
      if (!localMaterial) return material
      return { ...localMaterial, ...material, text: localMaterial.text, pages: localMaterial.pages,
        chunks: localMaterial.chunks, topics: localMaterial.topics, artifacts: localMaterial.artifacts,
        remotePlaceholder: true }
    })
    return { ...course, materials: [...mergedMaterials, ...localMaterials] }
  })
  const remoteIds = new Set(remote.map(course => course.id))
  const localOnly = local.filter(course => !remoteIds.has(course.id))
  courses.push(...localOnly)
  missing.push(...localOnly)
  if (missing.length) {
    const pending = new Map<string, Course>()
    for (const course of missing) {
      const earlier = pending.get(course.id)
      const materials = new Map([...(earlier?.materials ?? []), ...course.materials].map(material => [material.id, material]))
      pending.set(course.id, { ...course, materials: [...materials.values()] })
    }
    await saveCourses(userId, [...pending.values()])
  }
  // Hydrate before App enables writes: a slow read must never allow an older
  // browser cache to overwrite progress from another device. Signals are small;
  // document bodies, chunks, artifacts and solutions remain lazy loaded.
  const signals = await loadStudySignals(userId, courses.map(course => course.id))
  return { courses, ...signals }
}

export async function loadCourseDetails(userId: string, courseId: string) {
  if (!supabase) throw new Error('Nexo no está conectado con tu cuenta.')
  const [materialsResult, signals] = await Promise.all([
    supabase.from('materials').select('id,course_id,title,content,source_type,source_name,pages,page_count,metadata,document_kind,analysis_status,analyzed_pages,storage_path,processing_status,study_pack,study_pack_meta,created_at').eq('user_id', userId).eq('course_id', courseId),
    loadStudySignals(userId, [courseId]),
  ])
  if (materialsResult.error) throw materialsResult.error
  const materials = ((materialsResult.data ?? []) as MaterialRow[]).map(mapMaterial)
  return { materials, ...signals }
}

// Home/Progress need academic signals, without loading material bodies or chunks.
export async function loadStudySignals(userId: string, courseIds: string[]) {
  if (!supabase) throw new Error('Nexo no está conectado con tu cuenta.')
  if (!courseIds.length) return { activity: {}, memory: {}, sessions: [] }
  const [progressResult, learningResult, sessionResult] = await Promise.all([
    supabase.from('study_progress').select('material_id,activity').eq('user_id', userId).in('course_id', courseIds),
    supabase.from('learning_state').select('material_id,concept_key,concept_label,status,confidence,attempts,correct_attempts,updated_at').eq('user_id', userId).in('course_id', courseIds),
    supabase.from('study_sessions').select('id,course_id,objective,duration_minutes,status,plan,results,created_at,completed_at').eq('user_id', userId).in('course_id', courseIds),
  ])
  const error = progressResult.error || learningResult.error || sessionResult.error
  if (error) throw error
  const activity: StudyActivity = Object.fromEntries((progressResult.data ?? [])
    .filter(row => row.activity && typeof row.activity === 'object' && !Array.isArray(row.activity))
    .map(row => [row.material_id, row.activity]))
  const memory: LearningMemory = Object.fromEntries((learningResult.data ?? []).map(row => [
    `${row.material_id}:${row.concept_key}`,
    { key: `${row.material_id}:${row.concept_key}`, label: row.concept_label, materialId: row.material_id,
      status: row.status, confidence: Number(row.confidence), attempts: row.attempts,
      correctAttempts: row.correct_attempts, updatedAt: row.updated_at },
  ]))
  const sessions: StudySession[] = (sessionResult.data ?? []).map(row => ({
    id: row.id, courseId: row.course_id, objective: row.objective, durationMinutes: row.duration_minutes,
    status: row.status, plan: Array.isArray(row.plan) ? row.plan : [], results: row.results ?? {},
    createdAt: row.created_at, completedAt: row.completed_at ?? undefined,
  }))
  return { activity, memory, sessions }
}

export async function loadMaterialContext(userId: string, materialId: string) {
  if (!supabase) throw new Error('Nexo no está conectado con tu cuenta.')
  const [chunkResult, topicResult, artifactResult] = await Promise.all([
    supabase.from('material_chunks').select('id,material_id,page_start,page_end,content,keywords').eq('user_id', userId).eq('material_id', materialId),
    supabase.from('material_topics').select('id,material_id,title,summary,page_start,page_end,keywords').eq('user_id', userId).eq('material_id', materialId),
    supabase.from('study_artifacts').select('id,source_material_id,type,status,payload,version,error_message,created_at,updated_at').eq('user_id', userId).eq('source_material_id', materialId),
  ])
  const error = chunkResult.error || topicResult.error || artifactResult.error
  if (error) throw error
  const chunks: MaterialChunk[] = (chunkResult.data ?? []).map(chunk => ({ id: chunk.id, materialId: chunk.material_id,
    pageStart: chunk.page_start, pageEnd: chunk.page_end, text: chunk.content, keywords: chunk.keywords ?? [] }))
  const topics: MaterialTopic[] = (topicResult.data ?? []).map(topic => ({ id: topic.id, materialId: topic.material_id,
    title: topic.title, summary: topic.summary, pageStart: topic.page_start ?? undefined,
    pageEnd: topic.page_end ?? undefined, keywords: topic.keywords ?? [] }))
  const artifacts: StudyArtifact[] = (artifactResult.data ?? []).map(artifact => ({ id: artifact.id, type: artifact.type,
    status: artifact.status, payload: artifact.payload, version: artifact.version,
    errorMessage: artifact.error_message ?? undefined, sourceMaterialId: artifact.source_material_id,
    createdAt: artifact.created_at, updatedAt: artifact.updated_at }))
  return { chunks, topics, artifacts }
}

export async function loadCourseArtifacts(userId: string, courseId: string): Promise<StudyArtifact[]> {
  if (!supabase) throw new Error('Nexo no está conectado con tu cuenta.')
  const { data, error } = await supabase.from('study_artifacts')
    .select('id,source_material_id,type,status,payload,version,error_message,created_at,updated_at')
    .eq('user_id', userId).eq('course_id', courseId)
  if (error) throw error
  return (data ?? []).map(artifact => ({ id: artifact.id, type: artifact.type,
    status: artifact.status, payload: artifact.payload, version: artifact.version,
    errorMessage: artifact.error_message ?? undefined, sourceMaterialId: artifact.source_material_id,
    createdAt: artifact.created_at, updatedAt: artifact.updated_at }))
}

export async function searchRemoteContext(course: Course, question: string, materialId?: string) {
  if (!supabase) throw new Error('Nexo no está conectado con tu cuenta.')
  const { data, error } = await supabase.rpc('search_material_chunks_v2', {
    p_course_id: course.id, p_question: question, p_material_id: materialId ?? null, p_limit: 6,
  })
  if (error) throw error
  const rows: { material_id: string; page_start: number; page_end: number; content: string }[] = Array.isArray(data)
    ? (data as unknown[]).flatMap(item => {
      if (!item || typeof item !== 'object') return []
      const row = item as Record<string, unknown>
      return typeof row.material_id === 'string' && typeof row.page_start === 'number' &&
        typeof row.page_end === 'number' && typeof row.content === 'string'
        ? [{ material_id: row.material_id, page_start: row.page_start, page_end: row.page_end, content: row.content }] : []
    }) : []
  const sources = rows.map(row => ({ materialId: String(row.material_id),
    materialTitle: course.materials.find(material => material.id === row.material_id)?.title ?? 'Material',
    pageStart: Number(row.page_start), pageEnd: Number(row.page_end) }))
  const context = rows.map((row, index) => {
    const source = sources[index]
    const pages = source.pageStart === source.pageEnd ? `página ${source.pageStart}` : `páginas ${source.pageStart}–${source.pageEnd}`
    return `[${source.materialTitle} · ${pages}]\n${String(row.content)}`
  }).join('\n\n')
  return { context: context.slice(0, 13500), sources }
}

export async function searchAcademicTopics(userId: string, query: string) {
  if (!supabase) return [] as { courseId: string; materialId: string; title: string; page: number }[]
  const term = query.trim().replace(/[%_,.()]/g, '').slice(0, 80)
  if (term.length < 2) return []
  const { data, error } = await supabase.from('material_topics')
    .select('course_id,material_id,title,page_start').eq('user_id', userId)
    .ilike('title', `%${term}%`).limit(15)
  if (error) throw error
  return (data ?? []).map(row => ({ courseId: row.course_id as string, materialId: row.material_id as string,
    title: row.title as string, page: row.page_start as number ?? 1 }))
}

export async function saveCourses(userId: string, courses: Course[]) {
  if (!supabase || !courses.length) return
  const courseRows = courses.map(course => ({ user_id: userId, id: course.id, name: course.name, emoji: course.emoji }))
  const courseResult = await supabase.from('courses').upsert(courseRows, { onConflict: 'user_id,id' })
  if (courseResult.error) throw courseResult.error
  const materials = courses.flatMap(course => course.materials.filter(material => !material.remotePlaceholder).map(material => ({ course, material })))
  if (!materials.length) return
  const materialRows = materials.map(({ course, material }) => ({
    user_id: userId, course_id: course.id, id: material.id, title: material.title,
    content: material.sourceType === 'pdf' ? '' : material.text,
    source_type: material.sourceType ?? 'text', source_name: material.sourceName ?? null,
    pages: material.sourceType === 'pdf' ? [] : material.pages ?? [], page_count: material.pageCount ?? material.pages?.length ?? null,
    metadata: material.sourceType === 'pdf' ? { byteSize: material.pdfBytes ?? null, title: material.pdfTitle ?? null, author: material.pdfAuthor ?? null } : {},
    document_kind: material.documentKind ?? (material.sourceType === 'pdf' ? 'unknown' : 'text'),
    analysis_status: material.analysisStatus ?? (material.processingStatus === 'ready' ? 'ready' : 'not_started'),
    analyzed_pages: material.analyzedPages ?? [],
    storage_path: material.storagePath ?? null, processing_status: material.processingStatus ?? 'ready',
    study_pack: material.studyPack ?? null, study_pack_meta: material.studyPackMeta ?? null,
    created_at: material.createdAt,
  }))
  const materialResult = await supabase.from('materials').upsert(materialRows, { onConflict: 'user_id,id' })
  if (materialResult.error) throw materialResult.error
}

export async function saveMaterialContext(userId: string, courseId: string, material: Material) {
  if (!supabase) return
  if (material.chunks?.length) {
    const { error } = await supabase.from('material_chunks').upsert(material.chunks.map(chunk => ({
      id: chunk.id, user_id: userId, course_id: courseId, material_id: material.id,
      page_start: chunk.pageStart, page_end: chunk.pageEnd, content: chunk.text, keywords: chunk.keywords,
    })), { onConflict: 'id' })
    if (error) throw error
  }
  if (material.topics?.length) {
    const { error } = await supabase.from('material_topics').upsert(material.topics.map(topic => ({
      id: topic.id, user_id: userId, course_id: courseId, material_id: material.id,
      title: topic.title, summary: topic.summary, page_start: topic.pageStart ?? null,
      page_end: topic.pageEnd ?? null, keywords: topic.keywords,
    })), { onConflict: 'id' })
    if (error) throw error
  }
}

export async function saveArtifact(userId: string, courseId: string, artifact: StudyArtifact) {
  if (!supabase) return
  const { error } = await supabase.from('study_artifacts').upsert({
    id: artifact.id, user_id: userId, course_id: courseId, source_material_id: artifact.sourceMaterialId,
    type: artifact.type, status: artifact.status, payload: artifact.payload ?? {}, version: artifact.version,
    error_message: artifact.errorMessage ?? null, created_at: artifact.createdAt, updated_at: artifact.updatedAt,
  }, { onConflict: 'user_id,source_material_id,type,version' })
  if (error) throw error
}

export async function saveActivity(userId: string, courses: Course[], activity: StudyActivity) {
  if (!supabase) return
  const rows = courses.flatMap(course => course.materials.filter(material => activity[material.id])
    .map(material => ({ user_id: userId, course_id: course.id, material_id: material.id, activity: activity[material.id] })))
  if (!rows.length) return
  const { error } = await supabase.from('study_progress').upsert(rows, { onConflict: 'user_id,material_id' })
  if (error) throw error
}

export async function saveLearningState(userId: string, courses: Course[], memory: LearningMemory) {
  if (!supabase) return
  const courseForMaterial = new Map(courses.flatMap(course => course.materials.map(material => [material.id, course.id] as const)))
  const rows = Object.values(memory).flatMap(concept => {
    const courseId = courseForMaterial.get(concept.materialId)
    if (!courseId) return []
    return [{ user_id: userId, course_id: courseId, material_id: concept.materialId,
      concept_key: concept.key.slice(concept.materialId.length + 1), concept_label: concept.label,
      status: concept.status, confidence: concept.confidence, attempts: concept.attempts,
      correct_attempts: concept.correctAttempts }]
  })
  if (!rows.length) return
  const { error } = await supabase.from('learning_state').upsert(rows, { onConflict: 'user_id,material_id,concept_key' })
  if (error) throw error
}

export async function saveSessions(userId: string, sessions: StudySession[]) {
  if (!supabase || !sessions.length) return
  const rows = sessions.map(session => ({ user_id: userId, id: session.id, course_id: session.courseId,
    objective: session.objective, duration_minutes: session.durationMinutes, status: session.status,
    plan: session.plan, results: session.results, created_at: session.createdAt,
    completed_at: session.completedAt ?? null }))
  const { error } = await supabase.from('study_sessions').upsert(rows, { onConflict: 'user_id,id' })
  if (error) throw error
}

export async function saveSessionEvents(userId: string, events: StudySessionEvent[]) {
  if (!supabase || !events.length) return
  const rows = events.map(event => ({ id: event.id, user_id: userId, session_id: event.sessionId,
    activity_type: event.activityType, material_id: event.materialId ?? null,
    result: event.result, created_at: event.createdAt }))
  const { error } = await supabase.from('study_session_events').upsert(rows, { onConflict: 'id' })
  if (error) throw error
}

export async function uploadPrivatePdf(userId: string, courseId: string, materialId: string, file: File) {
  if (!supabase) throw new Error('Nexo no está conectado con tu cuenta.')
  const path = `${userId}/${courseId}/${materialId}/original.pdf`
  const { error } = await supabase.storage.from('study-pdfs').upload(path, file, { contentType: 'application/pdf', upsert: true })
  if (error) throw error
  return path
}

export async function signedPdfUrl(path: string) {
  if (!supabase) throw new Error('Nexo no está conectado con tu cuenta.')
  const { data, error } = await supabase.storage.from('study-pdfs').createSignedUrl(path, 60 * 10)
  if (error || !data?.signedUrl) throw error || new Error('No pudimos abrir el PDF.')
  return data.signedUrl
}

function mapSolution(row: Record<string, unknown>): SavedSolution {
  return { id: String(row.id), userId: String(row.user_id), courseId: String(row.course_id),
    question: String(row.question), answer: String(row.answer), category: String(row.category),
    source: 'resolver', sourceKey: String(row.source_key), createdAt: String(row.created_at), updatedAt: String(row.updated_at),
    attachments: Array.isArray(row.attachments) ? row.attachments as SolutionAttachment[] : [] }
}

export async function loadCourseSolutions(userId: string, courseId: string) {
  if (!supabase) throw new Error('Nexo no está conectado con tu cuenta.')
  const { data, error } = await supabase.from('saved_solutions').select('*')
    .eq('user_id', userId).eq('course_id', courseId).eq('status', 'ready').order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(mapSolution)
}

export async function loadSavedSolution(userId: string, solutionId: string) {
  if (!supabase) throw new Error('Nexo no está conectado con tu cuenta.')
  const { data, error } = await supabase.from('saved_solutions').select('*')
    .eq('user_id', userId).eq('id', solutionId).eq('status', 'ready').single()
  if (error) throw error
  return mapSolution(data)
}

export async function saveSolution(userId: string, courseId: string, draft: SolutionDraft): Promise<SavedSolution> {
  if (!supabase) throw new Error('Nexo no está conectado con tu cuenta.')
  if (draft.expectedImages !== draft.images.length) throw new Error('Las imágenes de esta conversación ya no están disponibles. Vuelve a adjuntarlas en Resolver antes de guardar.')
  if (!draft.question.trim() || !draft.answer.trim() || draft.images.length > 4) throw new Error('La solución está incompleta.')
  const lookup = await supabase.from('saved_solutions').select('*').eq('user_id', userId)
    .eq('course_id', courseId).eq('source_key', draft.sourceKey).maybeSingle()
  if (lookup.error) throw lookup.error
  if (lookup.data?.status === 'ready') return mapSolution(lookup.data)
  if (lookup.data) {
    if (Date.now() - Date.parse(lookup.data.created_at) < 10 * 60 * 1000) throw new Error('Hay un guardado en curso o incompleto de esta respuesta. Reintenta en 10 minutos para recuperar los adjuntos pendientes.')
    const prefix = `${userId}/${courseId}/solutions/${lookup.data.id}`
    const listed = await supabase.storage.from('solution-images').list(prefix, { limit: 10 })
    if (listed.error) throw listed.error
    const paths = (listed.data ?? []).map(file => `${prefix}/${file.name}`)
    if (paths.length) {
      const removed = await supabase.storage.from('solution-images').remove(paths)
      if (removed.error) throw removed.error
    }
    const removed = await supabase.from('saved_solutions').delete().eq('user_id', userId).eq('id', lookup.data.id).eq('status', 'saving')
    if (removed.error) throw removed.error
  }
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const row = { id, user_id: userId, course_id: courseId, question: draft.question, answer: draft.answer,
    category: draft.category, source: 'resolver', source_key: draft.sourceKey, attachments: [], status: 'saving', created_at: now, updated_at: now }
  const inserted = await supabase.from('saved_solutions').insert(row)
  if (inserted.error) throw inserted.error
  const uploaded: string[] = []
  try {
    const attachments: SolutionAttachment[] = []
    for (const [index, image] of draft.images.entries()) {
      if (!image.dataUrl.startsWith(`data:${image.mimeType};base64,`) || !['image/png', 'image/jpeg', 'image/webp'].includes(image.mimeType)) throw new Error('Una imagen tiene un formato inválido.')
      const bytes = Uint8Array.from(atob(image.dataUrl.split(',')[1]), character => character.charCodeAt(0))
      if (!bytes.length || bytes.length > 3145728) throw new Error('Una imagen supera el límite de 3 MB.')
      const extension = image.mimeType === 'image/jpeg' ? 'jpg' : image.mimeType.split('/')[1]
      const storagePath = `${userId}/${courseId}/solutions/${id}/${index + 1}.${extension}`
      const { error } = await supabase.storage.from('solution-images').upload(storagePath, new Blob([bytes], { type: image.mimeType }), { contentType: image.mimeType, upsert: false })
      if (error) throw error
      uploaded.push(storagePath)
      attachments.push({ storagePath, mimeType: image.mimeType as SolutionAttachment['mimeType'], name: image.name.slice(0, 240), bytes: bytes.length })
    }
    const { data, error } = await supabase.from('saved_solutions').update({ attachments, status: 'ready' })
      .eq('user_id', userId).eq('id', id).select('*').single()
    if (error) throw error
    return mapSolution(data)
  } catch (error) {
    // Remove files before the row, so its owner policy remains valid throughout cleanup.
    // An upload can reach Storage even if its HTTP response is lost. List the prefix too.
    const prefix = `${userId}/${courseId}/solutions/${id}`
    const listed = await supabase.storage.from('solution-images').list(prefix, { limit: 10 })
    if (listed.error) throw new Error('El guardado falló y no pudimos comprobar sus adjuntos. Conservamos el registro pendiente para reintentar la limpieza en 10 minutos.')
    const paths = Array.from(new Set([...uploaded, ...(listed.data ?? []).map(file => `${prefix}/${file.name}`)]))
    const removal = paths.length ? await supabase.storage.from('solution-images').remove(paths) : { error: null }
    if (!removal.error) {
      const rollback = await supabase.from('saved_solutions').delete().eq('user_id', userId).eq('id', id)
      if (rollback.error) throw new Error('El guardado falló y quedó un registro pendiente. Revisa tu conexión antes de reintentar.')
    } else throw new Error('El guardado falló y quedaron adjuntos pendientes de limpieza. Revisa tu conexión antes de reintentar.')
    throw error
  }
}

export async function signedSolutionImage(path: string) {
  if (!supabase) throw new Error('Nexo no está conectado con tu cuenta.')
  const { data, error } = await supabase.storage.from('solution-images').createSignedUrl(path, 60 * 10)
  if (error || !data?.signedUrl) throw error || new Error('No pudimos abrir esta imagen.')
  return data.signedUrl
}

export async function deleteSolution(userId: string, solution: SavedSolution) {
  if (!supabase) throw new Error('Nexo no está conectado con tu cuenta.')
  if (solution.attachments.length) {
    const { error } = await supabase.storage.from('solution-images').remove(solution.attachments.map(image => image.storagePath))
    if (error) throw error
  }
  const { error } = await supabase.from('saved_solutions').delete().eq('user_id', userId).eq('id', solution.id)
  if (error) throw error
}

export async function searchSavedSolutions(userId: string, query: string) {
  if (!supabase || query.trim().length < 2) return []
  const term = query.trim().replace(/[%_,.()]/g, '').slice(0, 80)
  const { data, error } = await supabase.from('saved_solutions').select('id,course_id,question,category')
    .eq('user_id', userId).eq('status', 'ready').ilike('question', `%${term}%`).limit(15)
  if (error) throw error
  return (data ?? []).map(row => ({ id: String(row.id), courseId: String(row.course_id), question: String(row.question) }))
}

export async function loadPageText(userId: string, material: Material, page: number) {
  const local = material.pages?.find(item => item.page === page)?.text || material.chunks?.filter(chunk => chunk.pageStart === page && chunk.pageEnd === page).map(chunk => chunk.text).join('\n')
  if (local) return local.slice(0, 15000)
  if (!supabase) return ''
  const { data, error } = await supabase.from('material_chunks').select('content').eq('user_id', userId)
    .eq('material_id', material.id).eq('page_start', page).eq('page_end', page).limit(8)
  if (error) throw error
  return (data ?? []).map(row => String(row.content)).join('\n').slice(0, 15000)
}
