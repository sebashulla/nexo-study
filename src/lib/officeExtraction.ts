import type { MaterialPage, NormalizedDocument, SourceBlock } from '../types'
import { normalizedDocument, sourceLimits } from './sourceModel'

type Entry = { offset: number; compressed: number; expanded: number; method: number; crc: number; name: string }
function invalid(message = 'El documento Office está dañado, cifrado o usa un formato no compatible.'): never { throw new Error(message) }
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff
  for (const byte of bytes) { crc ^= byte; for (let n=0;n<8;n++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0) }
  return (crc ^ 0xffffffff) >>> 0
}
async function officeArchive(file: File) {
  const buffer = await file.arrayBuffer(), view = new DataView(buffer), bytes = new Uint8Array(buffer)
  let end = -1
  for (let pos = buffer.byteLength - 22; pos >= Math.max(0,buffer.byteLength - 65557); pos--)
    if (view.getUint32(pos,true) === 0x06054b50 && pos + 22 + view.getUint16(pos+20,true) === buffer.byteLength) { end = pos; break }
  if (end < 0 || view.getUint16(end+4,true) || view.getUint16(end+6,true)) invalid()
  const count = view.getUint16(end+10,true), size = view.getUint32(end+12,true), start = view.getUint32(end+16,true)
  if (count > 2048 || count === 65535 || start + size !== end || view.getUint16(end+8,true) !== count) invalid()
  const entries = new Map<string,Entry>()
  let pos = start
  for (let i=0;i<count;i++) {
    if (pos+46 > end || view.getUint32(pos,true) !== 0x02014b50) invalid()
    const flags = view.getUint16(pos+8,true), method = view.getUint16(pos+10,true)
    const compressed = view.getUint32(pos+20,true), expanded = view.getUint32(pos+24,true)
    const nameLength = view.getUint16(pos+28,true), extraLength = view.getUint16(pos+30,true), commentLength = view.getUint16(pos+32,true)
    const next = pos+46+nameLength+extraLength+commentLength
    if (flags & 1 || ![0,8].includes(method) || next > end || compressed === 0xffffffff || expanded === 0xffffffff) invalid()
    const name = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(pos+46,pos+46+nameLength))
    if (!name || name.includes('\\') || name.startsWith('/') || name.split('/').includes('..') || entries.has(name) || /vbaProject|\.exe$/i.test(name)) invalid()
    entries.set(name,{ name, method, compressed, expanded, offset: view.getUint32(pos+42,true), crc: view.getUint32(pos+16,true) }); pos = next
  }
  if (pos !== end) invalid()
  let total = 0
  const read = async (name: string) => {
    const entry = entries.get(name); if (!entry) invalid(`Falta una parte necesaria del documento: ${name}.`)
    const p = entry.offset
    if (entry.expanded > sourceLimits.xmlBytes || entry.expanded > Math.max(1024*1024,entry.compressed*250) || total + entry.expanded > sourceLimits.expandedBytes) invalid('El contenido descomprimido supera el límite seguro. Divide el documento.')
    if (p+30 > start || view.getUint32(p,true) !== 0x04034b50 || view.getUint16(p+8,true) !== entry.method || view.getUint16(p+6,true) & 1) invalid()
    const length = view.getUint16(p+26,true), extra = view.getUint16(p+28,true)
    const dataStart = p+30+length+extra
    if (dataStart+entry.compressed > start || new TextDecoder().decode(bytes.subarray(p+30,p+30+length)) !== name) invalid()
    let output: Uint8Array
    const compressed = new Uint8Array(bytes.subarray(dataStart,dataStart+entry.compressed))
    if (entry.method === 0) output = compressed
    else {
      let stream: DecompressionStream
      try { stream = new DecompressionStream('deflate-raw') } catch { invalid('Este navegador no permite leer Office. Actualízalo o exporta el documento a PDF o TXT.') }
      const reader = new Blob([compressed]).stream().pipeThrough(stream).getReader()
      const parts: Uint8Array[] = []; let size = 0
      try {
        while (true) { const next = await reader.read(); if (next.done) break
          size += next.value.length
          if (size > entry.expanded || size > sourceLimits.xmlBytes) { await reader.cancel(); invalid('El documento supera el límite de descompresión seguro.') }
          parts.push(next.value)
        }
      } finally { reader.releaseLock() }
      output = new Uint8Array(size); let offset = 0
      for (const part of parts) { output.set(part,offset); offset += part.length }
    }
    if (output.length !== entry.expanded || crc32(output) !== entry.crc) invalid()
    total += output.length
    const text = new TextDecoder('utf-8', { fatal: true }).decode(output)
    if (/<!DOCTYPE|<!ENTITY/i.test(text)) invalid('El documento contiene declaraciones XML no permitidas.')
    const xml = new DOMParser().parseFromString(text, 'application/xml')
    if (xml.getElementsByTagName('parsererror').length) invalid()
    return xml
  }
  return { read, has: (name: string) => entries.has(name) }
}
const elements = (node: Document | Element, name: string) => Array.from(node.getElementsByTagNameNS('*', name))
const attr = (node: Element | undefined, name: string) => node ? Array.from(node.attributes).find(item => item.localName === name)?.value : undefined
const paragraphText = (p: Element) => {
  const walk = (node: Node): string => node.nodeType === Node.ELEMENT_NODE && ['t','tab','br'].includes((node as Element).localName)
    ? (node as Element).localName === 't' ? node.textContent ?? '' : (node as Element).localName === 'tab' ? '\t' : '\n'
    : Array.from(node.childNodes).map(walk).join('')
  return walk(p).trim()
}
function resolvePart(part: string, target: string) {
  if (!target || /[:\\?#]/.test(target)) invalid()
  const resolved = new URL(target,`https://package.invalid/${part}`).pathname.slice(1)
  if (!resolved || !resolved.startsWith(part.split('/')[0]+'/')) invalid()
  return resolved
}
export async function extractOffice(file: File, type: 'docx' | 'pptx', title: string): Promise<NormalizedDocument> {
  const archive = await officeArchive(file)
  const contentTypes = await archive.read('[Content_Types].xml')
  const expected = type === 'docx' ? 'wordprocessingml.document.main+xml' : 'presentationml.presentation.main+xml'
  if (!elements(contentTypes,'Override').some(element => (element.getAttribute('ContentType') ?? '').endsWith(expected))) invalid('El archivo no es un documento DOCX/PPTX válido.')
  const sections: MaterialPage[] = []
  if (type === 'docx') {
    const xml = await archive.read('word/document.xml')
    const body = elements(xml,'body')[0]; if (!body) invalid()
    const headingStyles = new Map<string,number>()
    if (archive.has('word/styles.xml')) {
      const styles = await archive.read('word/styles.xml')
      for (const style of elements(styles,'style')) {
        const name = attr(elements(style,'name')[0],'val') ?? ''
        const level = attr(elements(style,'outlineLvl')[0],'val')
        if (level !== undefined || /heading\s*[1-6]|t[ií]tulo\s*[1-6]/i.test(name)) headingStyles.set(attr(style,'styleId') ?? '', level !== undefined ? Number(level)+1 : Number(name.match(/[1-6]/)?.[0] ?? 1))
      }
    }
    let heading = '', blocks: SourceBlock[] = []
    const flush = () => { if (blocks.length) { sections.push({ page: sections.length+1, heading: heading || undefined, text: blocks.map(block => block.text).join('\n\n'), blocks }); blocks = [] } }
    for (const child of Array.from(body.children)) {
      if (child.localName === 'p') {
        const text = paragraphText(child); if (!text) continue
        const style = attr(elements(child,'pStyle')[0],'val') ?? ''
        const level = headingStyles.get(style) ?? (style.match(/^Heading([1-6])$/i) ? Number(style.slice(-1)) : undefined)
        if (level) { flush(); heading = text.slice(0,180); blocks.push({ kind: 'heading', text, level }) }
        else blocks.push({ kind: elements(child,'numPr').length ? 'list' : 'paragraph', text })
      } else if (child.localName === 'tbl') {
        const rows = elements(child,'tr').map(row => Array.from(row.children).filter(cell => cell.localName === 'tc')
          .map(cell => elements(cell,'p').map(paragraphText).filter(Boolean).join(' / ')).join(' | ')).filter(Boolean)
        if (rows.length) blocks.push({ kind: 'table', text: rows.join('\n') })
      }
      if (blocks.map(block => block.text).join('').length > 6000) flush()
    }
    flush()
  } else {
    const presentation = await archive.read('ppt/presentation.xml'), relations = await archive.read('ppt/_rels/presentation.xml.rels')
    const rels = new Map(elements(relations,'Relationship').filter(rel => rel.getAttribute('TargetMode') !== 'External')
      .map(rel => [rel.getAttribute('Id'), rel.getAttribute('Target') ?? '']))
    const ids = elements(presentation,'sldId')
    if (ids.length > sourceLimits.units) invalid('La presentación supera 500 diapositivas. Divídela.')
    for (const [index,id] of ids.entries()) {
      const target = rels.get(Array.from(id.attributes).find(a => a.localName === 'id' && a.namespaceURI)?.value ?? '')
      if (!target) invalid()
      const path = resolvePart('ppt/presentation.xml',target), xml = await archive.read(path)
      const blocks: SourceBlock[] = []
      let heading = ''
      for (const shape of elements(xml,'sp')) {
        const paragraphs = elements(shape,'p').map(paragraphText).filter(Boolean)
        const placeholder = elements(shape,'ph')[0]?.getAttribute('type')
        if (['title','ctrTitle'].includes(placeholder ?? '')) heading = paragraphs.join(' ').slice(0,180)
      }
      for (const p of elements(xml,'p')) { const text = paragraphText(p); if (text) blocks.push({ kind: 'paragraph', text }) }
      const slash = path.lastIndexOf('/'), relationships = `${path.slice(0,slash)}/_rels/${path.slice(slash+1)}.rels`
      if (archive.has(relationships)) {
        const refs = await archive.read(relationships)
        const note = elements(refs,'Relationship').find(rel => rel.getAttribute('TargetMode') !== 'External' && rel.getAttribute('Type')?.endsWith('/notesSlide'))
        if (note) {
          const notesXml = await archive.read(resolvePart(path,note.getAttribute('Target') ?? ''))
          for (const shape of elements(notesXml,'sp')) {
            const kind = elements(shape,'ph')[0]?.getAttribute('type')
            if (kind && kind !== 'body') continue
            const text = elements(shape,'p').map(paragraphText).filter(Boolean).join('\n')
            if (text) blocks.push({ kind: 'notes', text: `Notas del presentador:\n${text}` })
          }
        }
      }
      sections.push({ page: index+1, heading: heading || undefined, text: blocks.map(block => block.text).join('\n\n'), blocks })
      // Yield between slides so navigation and processing status remain responsive.
      await new Promise<void>(resolve => setTimeout(resolve,0))
    }
  }
  if (!sections.some(unit => unit.text.trim())) invalid('No pudimos extraer texto de este documento. Puede contener solo imágenes; exporta a PDF para analizarlo visualmente.')
  const blank = sections.some(unit => !unit.text.trim())
  return normalizedDocument(title,sections,{ originalFilename: file.name, mimeType: file.type, extraction: 'office-semantic-text' },blank,
    blank ? 'Algunas diapositivas no tienen texto extraíble. Las imágenes y gráficos no se transcriben automáticamente.' : undefined)
}
