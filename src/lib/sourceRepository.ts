import type { Material } from '../types'
import { supabase } from './supabase'
import { validateSourceFile } from './sourceModel'

function client() { if (!supabase) throw new Error('Nexo no está conectado con tu cuenta.'); return supabase }
function migrationError(error: { code?: string; message?: string } | null) {
  return error?.code === 'PGRST202' || error?.code === '42883'
    ? new Error('Las nuevas fuentes necesitan la migración 011 en tu cuenta. Conservamos el material pendiente; reintenta cuando esté aplicada.') : error
}
export function sourceBucket(material: Material) { return material.sourceType === 'pdf' ? 'study-pdfs' : 'study-sources' }
export async function uploadPrivateSource(userId: string, courseId: string, materialId: string, file: File) {
  const { extension, mimeType } = await validateSourceFile(file)
  const path = `${userId}/${courseId}/${materialId}/original.${extension}`
  const { error } = await client().storage.from('study-sources').upload(path,file,{ contentType: mimeType, upsert: true })
  if (error) throw new Error('No pudimos subir el original privado. El material conserva el estado pendiente para reintentar.')
  return path
}
export async function signedSourceUrl(material: Material) {
  if (!material.storagePath) throw new Error('El original todavía no está guardado.')
  const { data,error } = await client().storage.from(sourceBucket(material)).createSignedUrl(material.storagePath,600)
  if (error || !data?.signedUrl) throw new Error('No pudimos abrir el original privado. Reintenta con conexión.')
  return data.signedUrl
}
export async function archiveSource(courseId: string, materialId: string, archived: boolean): Promise<number> {
  const { data,error } = await client().rpc('archive_source_material',{ p_course_id: courseId,p_material_id: materialId,p_archived: archived })
  if (error || typeof data !== 'number') throw migrationError(error) ?? new Error('No pudimos archivar este material.')
  return data
}
export async function commitSourceDocument(courseId: string, material: Material, expectedRevision: number) {
  const { error } = await client().rpc('commit_source_document',{ p_course_id: courseId, p_material_id: material.id, p_expected_revision: expectedRevision,
    p_document: { title: material.title, text: material.text, pages: material.pages ?? [], metadata: { source: material.sourceMetadata ?? {},
      processingError: material.processingError ?? null, archivedAt: material.archivedAt ?? null, sourceRevision: material.sourceRevision ?? expectedRevision+1 },
      analysis_status: material.analysisStatus ?? 'ready', chunks: material.chunks ?? [], topics: material.topics ?? [],
      summary: material.artifacts?.filter(item => item.type === 'summary' && item.status === 'ready').slice(-1)[0]?.payload ?? {} } })
  if (error) throw migrationError(error)
}
export type CleanupJob = { id: string; course_id: string; material_id?: string; status: string; manifest: { bucket: string; path: string }[]; last_error?: string }
export async function beginAcademicCleanup(courseId: string, materialId?: string): Promise<CleanupJob> {
  const { data,error } = await client().rpc('begin_academic_cleanup',{ p_course_id: courseId, p_material_id: materialId ?? null })
  if (error || !data) throw migrationError(error) ?? new Error('No pudimos preparar la eliminación.')
  return data as CleanupJob
}
export async function listAcademicCleanup(userId: string): Promise<CleanupJob[]> {
  const { data,error } = await client().from('academic_cleanup_jobs').select('id,course_id,material_id,status,manifest,last_error').eq('user_id',userId).in('status',['pending','failed']).limit(30)
  if (error) throw migrationError(error)
  return data ?? []
}
export async function finishAcademicCleanup(job: CleanupJob) {
  try {
    for (const bucket of [...new Set(job.manifest.map(item => item.bucket))]) {
      const paths = job.manifest.filter(item => item.bucket === bucket).map(item => item.path)
      for (let index=0;index<paths.length;index+=100) {
        const { error } = await client().storage.from(bucket).remove(paths.slice(index,index+100))
        if (error) throw new Error('Quedan originales privados pendientes de limpieza. Conservamos el registro para reintentar.')
      }
    }
    const { error } = await client().rpc('finish_academic_cleanup',{ p_job_id: job.id })
    if (error) throw migrationError(error)
  } catch (cause) {
    await Promise.resolve(client().rpc('record_academic_cleanup_failure',{ p_job_id: job.id, p_error: 'No se completó la limpieza de Storage o metadatos.' })).catch(() => {})
    throw cause
  }
}
