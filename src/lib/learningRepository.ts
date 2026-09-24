import type { Course, Material, MaterialChunk, MaterialTopic, StudyArtifact, StudySession } from '../types'
import type { StudyActivity } from './studyProgress'
import type { LearningMemory } from './learningState'
import { supabase } from './supabase'

type CourseRow = { id: string; name: string; emoji: string }
type MaterialRow = {
  id: string; course_id: string; title: string; content: string; source_type: 'text' | 'pdf';
  source_name: string | null; pages: unknown; page_count: number | null; storage_path: string | null;
  processing_status: Material['processingStatus']; study_pack: Material['studyPack'] | null;
  study_pack_meta: Material['studyPackMeta'] | null; created_at: string
}

function validPages(value: unknown): Material['pages'] {
  return Array.isArray(value) && value.every(page => page && typeof page.page === 'number' && typeof page.text === 'string') ? value : undefined
}

function mapMaterial(row: MaterialRow): Material {
  return {
    id: row.id, title: row.title, text: row.content, createdAt: row.created_at,
    sourceType: row.source_type, sourceName: row.source_name ?? undefined,
    pages: validPages(row.pages), pageCount: row.page_count ?? undefined,
    storagePath: row.storage_path ?? undefined, processingStatus: row.processing_status ?? undefined,
    studyPack: row.study_pack ?? undefined, studyPackMeta: row.study_pack_meta ?? undefined,
  }
}

export async function synchronizeCourses(userId: string, local: Course[]): Promise<{ courses: Course[]; activity: StudyActivity; memory: LearningMemory; sessions: StudySession[] }> {
  if (!supabase) throw new Error('Nexo no está conectado con tu cuenta.')
  const [courseResult, materialResult, progressResult, chunkResult, topicResult, artifactResult, learningResult, sessionResult] = await Promise.all([
    supabase.from('courses').select('id,name,emoji').eq('user_id', userId),
    supabase.from('materials').select('id,course_id,title,content,source_type,source_name,pages,page_count,storage_path,processing_status,study_pack,study_pack_meta,created_at').eq('user_id', userId),
    supabase.from('study_progress').select('material_id,activity').eq('user_id', userId),
    supabase.from('material_chunks').select('id,material_id,page_start,page_end,content,keywords').eq('user_id', userId),
    supabase.from('material_topics').select('id,material_id,title,summary,page_start,page_end,keywords').eq('user_id', userId),
    supabase.from('study_artifacts').select('id,source_material_id,type,status,payload,version,error_message,created_at,updated_at').eq('user_id', userId),
    supabase.from('learning_state').select('material_id,concept_key,concept_label,status,confidence,attempts,correct_attempts,updated_at').eq('user_id', userId),
    supabase.from('study_sessions').select('id,course_id,objective,duration_minutes,status,plan,results,created_at,completed_at').eq('user_id', userId),
  ])
  const error = courseResult.error || materialResult.error || progressResult.error || chunkResult.error || topicResult.error || artifactResult.error || learningResult.error || sessionResult.error
  if (error) throw error
  const rows = (courseResult.data ?? []) as CourseRow[]
  const materialRows = (materialResult.data ?? []) as MaterialRow[]
  const remote = rows.map(row => ({
    id: row.id, name: row.name, emoji: row.emoji,
    materials: materialRows.filter(material => material.course_id === row.id).map(material => {
      const chunks: MaterialChunk[] = (chunkResult.data ?? []).filter(chunk => chunk.material_id === material.id)
        .map(chunk => ({ id: chunk.id, materialId: chunk.material_id, pageStart: chunk.page_start, pageEnd: chunk.page_end, text: chunk.content, keywords: chunk.keywords ?? [] }))
      const topics: MaterialTopic[] = (topicResult.data ?? []).filter(topic => topic.material_id === material.id)
        .map(topic => ({ id: topic.id, materialId: topic.material_id, title: topic.title, summary: topic.summary, pageStart: topic.page_start ?? undefined, pageEnd: topic.page_end ?? undefined, keywords: topic.keywords ?? [] }))
      const artifacts: StudyArtifact[] = (artifactResult.data ?? []).filter(artifact => artifact.source_material_id === material.id)
        .map(artifact => ({ id: artifact.id, type: artifact.type, status: artifact.status, payload: artifact.payload,
          version: artifact.version, errorMessage: artifact.error_message ?? undefined,
          sourceMaterialId: artifact.source_material_id, createdAt: artifact.created_at, updatedAt: artifact.updated_at }))
      return { ...mapMaterial(material), chunks, topics, artifacts }
    }),
  }))
  const localById = new Map(local.map(course => [course.id, course]))
  const missing: Course[] = []
  const missingArtifacts: { courseId: string; artifact: StudyArtifact }[] = []
  const courses = remote.map(course => {
    const localCourse = localById.get(course.id)
    const remoteMaterialIds = new Set(course.materials.map(material => material.id))
    const localMaterials = localCourse?.materials.filter(material => !remoteMaterialIds.has(material.id)) ?? []
    if (localMaterials.length) missing.push({ ...course, materials: localMaterials })
    const mergedMaterials = course.materials.map(material => {
      const localMaterial = localCourse?.materials.find(item => item.id === material.id)
      if (!localMaterial) return material
      const remoteArtifactIds = new Set(material.artifacts?.map(item => item.id))
      const localArtifacts = localMaterial.artifacts?.filter(item => !remoteArtifactIds.has(item.id)) ?? []
      for (const artifact of localArtifacts) missingArtifacts.push({ courseId: course.id, artifact })
      const needsContent = !material.text && Boolean(localMaterial.text)
      if (needsContent) missing.push({ ...course, materials: [localMaterial] })
      return { ...material, ...(needsContent ? { text: localMaterial.text, pages: localMaterial.pages, pageCount: localMaterial.pageCount,
        processingStatus: localMaterial.processingStatus, storagePath: material.storagePath ?? localMaterial.storagePath } : {}),
        chunks: material.chunks?.length ? material.chunks : localMaterial.chunks,
        topics: material.topics?.length ? material.topics : localMaterial.topics,
        artifacts: [...(material.artifacts ?? []), ...localArtifacts] }
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
  for (const { courseId, artifact } of missingArtifacts) await saveArtifact(userId, courseId, artifact)
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
  return { courses, activity, memory, sessions }
}

export async function saveCourses(userId: string, courses: Course[]) {
  if (!supabase || !courses.length) return
  const courseRows = courses.map(course => ({ user_id: userId, id: course.id, name: course.name, emoji: course.emoji }))
  const courseResult = await supabase.from('courses').upsert(courseRows, { onConflict: 'user_id,id' })
  if (courseResult.error) throw courseResult.error
  const materials = courses.flatMap(course => course.materials.map(material => ({ course, material })))
  if (!materials.length) return
  const materialRows = materials.map(({ course, material }) => ({
    user_id: userId, course_id: course.id, id: material.id, title: material.title, content: material.text,
    source_type: material.sourceType ?? 'text', source_name: material.sourceName ?? null,
    pages: material.pages ?? [], page_count: material.pageCount ?? material.pages?.length ?? null,
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
