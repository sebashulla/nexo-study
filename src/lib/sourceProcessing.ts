import type { NormalizedDocument, SourceType } from '../types'
import { normalizedDocument, normalizeText, normalizeTranscript, parseYouTubeUrl, sourceLimits, validateSourceFile } from './sourceModel'
import { supabase } from './supabase'

export type SourceInput = { courseId: string; title: string; sourceType: SourceType; file?: File; text?: string; url?: string }
async function remoteSource(input: SourceInput): Promise<NormalizedDocument> {
  const { data } = await supabase!.auth.getSession()
  if (!data.session) throw new Error('Tu sesión expiró. Inicia sesión nuevamente.')
  const response = await fetch('/api/sources/process',{ method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` },
    body: JSON.stringify({ sourceType: input.sourceType, url: input.url, title: input.title }), signal: AbortSignal.timeout(20000) })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'No pudimos preparar esta fuente. Reintenta con conexión.')
  if (typeof result.title !== 'string' || !Array.isArray(result.sections) || result.sections.length > sourceLimits.units ||
    result.sections.some((unit: { page: unknown; text: unknown; timestamp?: number }) => !Number.isInteger(unit.page) || typeof unit.text !== 'string' || unit.timestamp !== undefined && (!Number.isFinite(unit.timestamp) || unit.timestamp < 0))) throw new Error('La extracción devolvió un formato incompleto. Puedes reintentar.')
  return normalizedDocument(input.title || result.title,result.sections,result.sourceMetadata ?? {},Boolean(result.partial),result.warning)
}
export async function processSource(input: SourceInput): Promise<NormalizedDocument> {
  if (input.sourceType === 'web') return remoteSource(input)
  if (input.sourceType === 'youtube') {
    const metadata = parseYouTubeUrl(input.url ?? '')
    if (input.text?.trim()) return normalizeTranscript(input.title,input.text,metadata)
    return remoteSource(input)
  }
  if (input.file) {
    const spec = await validateSourceFile(input.file)
    if (spec.sourceType !== input.sourceType) throw new Error('El formato de la fuente cambió. Vuelve a elegir el archivo.')
    if (input.sourceType === 'docx' || input.sourceType === 'pptx') {
      const { extractOffice } = await import('./officeExtraction')
      return extractOffice(input.file,input.sourceType,input.title)
    }
    if (input.sourceType === 'image') {
      const [{ prepareImages },{ callAI }] = await Promise.all([import('./imageUtils'),import('./aiClient')])
      const images = await prepareImages([new File([input.file],input.file.name,{ type: spec.mimeType })])
      const raw = await callAI({ task: 'solve', category: 'Extracción de material académico', images,
        question: 'Extrae solamente el texto académico visible y describe los diagramas legibles. No resuelvas ejercicios ni inventes lo que no se ve. Devuelve solo JSON {"readable":true,"text":"texto y descripción observables"}. Si no hay contenido académico legible, devuelve {"readable":false,"text":""}.' })
      let result: { readable?: boolean; text?: string }
      try { result = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'')) } catch { throw new Error('Nexo no pudo organizar el contenido de esta imagen. Puedes reintentar.') }
      if (result.readable !== true || typeof result.text !== 'string' || result.text.trim().length < 20) throw new Error('No encontramos contenido académico legible. Sube una imagen más clara o pega su texto.')
      return normalizeText(input.title,result.text,{ originalFilename: input.file.name, mimeType: spec.mimeType, extraction: 'nexo-multimodal' })
    }
    if (input.sourceType === 'text') {
      const bytes = await input.file.arrayBuffer()
      let text: string
      try { text = new TextDecoder('utf-8',{ fatal: true }).decode(bytes) } catch { throw new Error('Guarda este archivo como texto UTF-8 y vuelve a subirlo.') }
      if (text.includes('\0')) throw new Error('Este archivo contiene datos binarios; usa TXT o Markdown.')
      return normalizeText(input.title,text,{ originalFilename: input.file.name, mimeType: spec.mimeType, extraction: 'utf8-text' })
    }
  }
  if (input.sourceType === 'note' || input.sourceType === 'text') return normalizeText(input.title,input.text ?? '',{ extraction: input.sourceType === 'note' ? 'manual-note' : 'pasted-text' })
  throw new Error('Esta fuente necesita un archivo original para prepararse.')
}
