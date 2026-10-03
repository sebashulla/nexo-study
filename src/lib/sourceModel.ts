import type { Material, MaterialPage, NormalizedDocument, SourceMetadata, SourceType } from '../types'

export const sourceLimits = { pdfBytes: 25 * 1024 * 1024, officeBytes: 20 * 1024 * 1024,
  imageBytes: 10 * 1024 * 1024, textBytes: 1024 * 1024, textChars: 300000, units: 500,
  xmlBytes: 4 * 1024 * 1024, expandedBytes: 24 * 1024 * 1024 }
export const sourceLabels: Record<SourceType, string> = { pdf: 'PDF', image: 'Imagen', docx: 'Documento', pptx: 'Presentación',
  text: 'Texto', web: 'Web', youtube: 'YouTube', note: 'Apunte' }
export const sourceAccept = '.pdf,.docx,.pptx,.txt,.md,.png,.jpg,.jpeg,.webp'
const fileTypes: Record<string, { type: SourceType; mime: string; max: number }> = {
  pdf: { type: 'pdf', mime: 'application/pdf', max: sourceLimits.pdfBytes },
  docx: { type: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', max: sourceLimits.officeBytes },
  pptx: { type: 'pptx', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', max: sourceLimits.officeBytes },
  txt: { type: 'text', mime: 'text/plain', max: sourceLimits.textBytes }, md: { type: 'text', mime: 'text/markdown', max: sourceLimits.textBytes },
  png: { type: 'image', mime: 'image/png', max: sourceLimits.imageBytes }, jpg: { type: 'image', mime: 'image/jpeg', max: sourceLimits.imageBytes },
  jpeg: { type: 'image', mime: 'image/jpeg', max: sourceLimits.imageBytes }, webp: { type: 'image', mime: 'image/webp', max: sourceLimits.imageBytes },
}
export async function validateSourceFile(file: File) {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  const spec = fileTypes[ext]
  if (!spec) throw new Error('Usa PDF, DOCX, PPTX, TXT, MD, PNG, JPG o WEBP.')
  if (!file.size || file.size > spec.max) throw new Error(`El archivo debe tener contenido y no superar ${spec.max / 1024 / 1024} MB.`)
  const accepted = [spec.mime, '', 'application/octet-stream', ...(ext === 'md' ? ['text/plain'] : [])]
  if (!accepted.includes(file.type.toLowerCase())) throw new Error('El formato del archivo no coincide con su extensión.')
  const bytes = new Uint8Array(await file.slice(0, 1024).arrayBuffer())
  const ascii = new TextDecoder().decode(bytes)
  const matches = spec.type === 'pdf' ? ascii.startsWith('%PDF-') : spec.type === 'docx' || spec.type === 'pptx'
    ? bytes[0] === 80 && bytes[1] === 75 && bytes[2] === 3 && bytes[3] === 4
    : ext === 'png' ? [137,80,78,71,13,10,26,10].every((v,i) => bytes[i] === v)
    : ext === 'jpg' || ext === 'jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : ext === 'webp' ? ascii.startsWith('RIFF') && ascii.slice(8,12) === 'WEBP'
    : !bytes.some(byte => byte === 0) && !ascii.includes('\uFFFD')
  if (!matches) throw new Error('El contenido del archivo no corresponde al formato indicado o está dañado.')
  return { sourceType: spec.type, mimeType: spec.mime, extension: ext }
}

export function normalizeText(title: string, text: string, sourceMetadata: SourceMetadata = {}): NormalizedDocument {
  const body = text.replace(/\r\n?/g, '\n').trim()
  if (!body || body.length > sourceLimits.textChars) throw new Error('Escribe contenido de hasta 300 000 caracteres.')
  const sections: MaterialPage[] = []
  let heading = '', paragraphs: string[] = []
  const flush = () => { if (paragraphs.length) sections.push({ page: sections.length + 1, heading: heading || undefined,
    text: paragraphs.join('\n\n'), blocks: paragraphs.map(text => ({ kind: 'paragraph' as const, text })) }); paragraphs = [] }
  for (const block of body.split(/\n\s*\n/)) {
    const lines = block.split('\n')
    for (const line of lines) {
      const match = line.match(/^#{1,6}\s+(.+)$/)
      if (match) { flush(); heading = match[1].trim().slice(0,180) }
      else if (line.trim()) paragraphs.push(line)
    }
    if (paragraphs.join('\n').length >= 5000) flush()
  }
  flush()
  if (!sections.length) sections.push({ page: 1, heading: heading || undefined, text: body })
  return normalizedDocument(title, sections, sourceMetadata)
}
export function normalizedDocument(title: string, sections: MaterialPage[], metadata: SourceMetadata, partial = false, warning?: string): NormalizedDocument {
  if (sections.length > sourceLimits.units) throw new Error('Este documento supera 500 secciones o diapositivas. Divídelo antes de incorporarlo.')
  sections = sections.map(unit => ({ ...unit, heading: unit.heading?.trim().slice(0,180) || undefined }))
  const plainText = sections.map(unit => unit.text).join('\n\n')
  if (plainText.length > sourceLimits.textChars) throw new Error('El contenido supera 300 000 caracteres. Divide el documento.')
  return { title: title.trim().slice(0,180), plainText, sections,
    sourceMetadata: { ...metadata, extractedAt: new Date().toISOString(), units: sections.map(({ page, heading, timestamp }) => ({ page, heading, timestamp })) }, partial, warning }
}
export function materialFromDocument(material: Material, document: NormalizedDocument): Material {
  return { ...material, title: material.title || document.title, text: document.plainText, pages: document.sections,
    pageCount: document.sections.length, sourceMetadata: document.sourceMetadata,
    documentKind: 'text', analyzedPages: document.sections.filter(unit => unit.text.trim()).map(unit => unit.page),
    processingStatus: 'ready', processingStage: undefined, analysisStatus: document.partial ? 'partial' : 'ready', processingError: document.warning }
}
export function timestampLabel(seconds: number) {
  const n = Math.max(0, Math.floor(seconds)); return n >= 3600 ? `${Math.floor(n/3600)}:${String(Math.floor(n%3600/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}` : `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`
}
export function sourceReference(material: Material | undefined, ordinal: number, end = ordinal) {
  const type = material?.sourceType ?? 'pdf'
  const unit = material?.pages?.find(item => item.page === ordinal) ?? material?.sourceMetadata?.units?.find(item => item.page === ordinal)
  if (type === 'pdf') return ordinal === end ? `página ${ordinal}` : `páginas ${ordinal}–${end}`
  if (type === 'pptx') return `Diapositiva ${ordinal}${end !== ordinal ? `–${end}` : ''}`
  if (type === 'youtube' && unit?.timestamp !== undefined) return `YouTube · ${timestampLabel(unit.timestamp)}`
  if (type === 'image') return 'Imagen · contenido extraído'
  return unit?.heading ? `sección «${unit.heading}»` : `sección ${ordinal}${end !== ordinal ? `–${end}` : ''}`
}
export function sourceDescription(material: Material) {
  const type = material.sourceType ?? 'text'
  const n = material.pageCount ?? material.pages?.length
  return `${sourceLabels[type]}${n ? ` · ${n} ${type === 'pdf' ? 'páginas' : type === 'pptx' ? 'diapositivas' : type === 'youtube' ? 'segmentos' : 'secciones'}` : ''}`
}
export function parseYouTubeUrl(value: string) {
  let url: URL; try { url = new URL(value.trim()) } catch { throw new Error('Pega una URL válida de YouTube.') }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) throw new Error('Usa un enlace HTTPS de YouTube.')
  const host = url.hostname.toLowerCase()
  const id = host === 'youtu.be' ? url.pathname.slice(1) : ['youtube.com','www.youtube.com','m.youtube.com'].includes(host)
    ? url.pathname === '/watch' ? url.searchParams.get('v') : url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)$/)?.[1] : null
  if (!id || !/^[a-zA-Z0-9_-]{11}$/.test(id)) throw new Error('No reconocemos este video. Usa youtube.com/watch o youtu.be.')
  return { videoId: id, sourceUrl: `https://www.youtube.com/watch?v=${id}` }
}
export function normalizeTranscript(title: string, text: string, metadata: SourceMetadata): NormalizedDocument {
  if (!text.trim() || text.length > sourceLimits.textChars) throw new Error('Pega una transcripción de hasta 300 000 caracteres.')
  const sections: MaterialPage[] = []
  let current: MaterialPage | undefined
  for (const line of text.replace(/\r/g,'').split('\n')) {
    const match = line.trim().match(/^\[?(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:[.,]\d+)?\]?\s*(.*)$/)
    if (match) {
      const timestamp = Number(match[1] ?? 0)*3600 + Number(match[2])*60 + Number(match[3])
      if (Number(match[2]) >= 60 || Number(match[3]) >= 60) throw new Error('Revisa los minutos y segundos de la transcripción.')
      current = { page: sections.length + 1, timestamp, text: match[4].replace(/\s*-->.*$/, '').trim() }; sections.push(current)
    } else if (line.trim() && !/^WEBVTT|^\d+$/.test(line.trim())) {
      if (!current) { current = { page: 1, text: '' }; sections.push(current) }
      current.text = `${current.text}\n${line.trim()}`.trim()
    }
  }
  const populated = sections.filter(unit => unit.text).map((unit,index) => ({ ...unit, page: index + 1 }))
  if (!populated.length) throw new Error('No encontramos texto en la transcripción.')
  if (populated.some((unit,index) => unit.timestamp !== undefined && index > 0 && unit.timestamp < (populated[index-1].timestamp ?? 0))) throw new Error('Ordena la transcripción por tiempo.')
  return normalizedDocument(title, populated, { ...metadata, extraction: 'manual-transcript' })
}
