import type { Material, MaterialChunk, MaterialTopic } from '../types'
import { sourceReference } from './sourceModel'

const MAX_CHUNK_CHARS = 2600
const STOP_WORDS = new Set('a al algo ante bajo con contra de del desde donde el ella en entre es esta este esto ha hay la las lo los más no o para por que se sin sobre su sus un una unas unos y ya'.split(' '))
const EDITORIAL_WORDS = /(?:https?:\/\/|www\.|\bdoi\b|\bissn\b|\bisbn\b|copyright|©|todos los derechos|rev(?:ista)?\s+med\b|vol(?:umen)?\.?\s*\d+|e-?mail|\breferencias?\b|bibliograf[ií]a)/i

function cleanAcademicLine(value: string) {
  const line = value.replace(/\[[Pp][áa]gina\s+\d+\]/g, '').replace(/\s+/g, ' ').trim()
  if (line.length < 24 || EDITORIAL_WORDS.test(line)) return ''
  const letters = (line.match(/[a-záéíóúüñ]/gi) ?? []).length
  const digits = (line.match(/\d/g) ?? []).length
  if (letters < 18 || digits > letters / 2 || /^\d+[.)\s]/.test(line) || /^[-–—\d\s.,:;]+$/.test(line)) return ''
  return line
}

function academicSentences(text: string) {
  return text.split(/(?<=[.!?])\s+|\n+/).map(cleanAcademicLine).filter(Boolean)
}

function topicTitle(text: string, words: string[], materialTitle: string) {
  const documentTitle = new Set(terms(materialTitle))
  const candidate = academicSentences(text).find(line => {
    const first = line.split(/[:.;]/)[0].trim()
    return first.length >= 25 && first.length <= 88 &&
      terms(first).some(word => !documentTitle.has(word)) && !/^(?:introducci[oó]n|resumen|abstract|objetivos?|resultados?|conclusiones?)$/i.test(first)
  })
  if (candidate) {
    const first = candidate.split(/[:.;]/)[0].trim()
    if (first.length <= 88) return first
  }
  const useful = words.filter(word => !documentTitle.has(word)).slice(0, 4)
  const fallback = useful.length ? useful : words.slice(0, 4)
  return fallback.length ? fallback.map((word, index) => index ? word : word[0].toUpperCase() + word.slice(1)).join(' · ') : ''
}

function terms(text: string) {
  return (text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])
    .filter(word => !STOP_WORDS.has(word))
}

function keywords(text: string, limit = 8) {
  const counts = new Map<string, number>()
  for (const word of terms(text)) counts.set(word, (counts.get(word) ?? 0) + 1)
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([word]) => word)
}

function splitText(text: string, maxChars = MAX_CHUNK_CHARS) {
  const result: string[] = []
  let rest = text.replace(/\s+/g, ' ').trim()
  while (rest.length > maxChars) {
    const boundary = rest.lastIndexOf(' ', maxChars)
    const cut = boundary > maxChars / 2 ? boundary : maxChars
    result.push(rest.slice(0, cut).trim())
    rest = rest.slice(cut).trim()
  }
  if (rest) result.push(rest)
  return result
}

export function chunksForMaterial(material: Material): MaterialChunk[] {
  const pages = material.pages?.length ? material.pages : [{ page: 1, text: material.text }]
  return pages.flatMap(page => splitText(page.text).map(text => ({
    id: crypto.randomUUID(), materialId: material.id, pageStart: page.page, pageEnd: page.page,
    text, keywords: keywords(text),
  })))
}

export function topicsForMaterial(material: Material, chunks: MaterialChunk[]): MaterialTopic[] {
  if (!chunks.length) return []
  const groupSize = chunks.length <= 2 ? 1 : Math.max(2, Math.ceil(chunks.length / 10))
  const topics: MaterialTopic[] = []
  for (let index = 0; index < chunks.length; index += groupSize) {
    const group = chunks.slice(index, index + groupSize)
    const text = group.map(chunk => chunk.text).join(' ')
    const clean = academicSentences(text)
    const termsByFrequency = keywords(clean.join(' '), 10)
    const title = topicTitle(clean.join(' '), termsByFrequency, material.title)
    if (!title || !clean.length) continue
    const summary = clean.slice(0, 2).join(' ').slice(0, 260)
    const next: MaterialTopic = {
      id: crypto.randomUUID(), materialId: material.id, title, summary,
      pageStart: group[0].pageStart, pageEnd: group[group.length - 1].pageEnd,
      keywords: termsByFrequency.slice(0, 8),
    }
    const previous = topics[topics.length - 1]
    const previousTerms = previous ? new Set(terms(previous.title)) : new Set<string>()
    const nextTerms = new Set(terms(title))
    const common = [...nextTerms].filter(word => previousTerms.has(word) && !STOP_WORDS.has(word))
    if (previous && (common.length >= 2 || common.some(word => word.length >= 7) &&
      Math.min(previousTerms.size, nextTerms.size) <= 3)) {
      previous.pageEnd = next.pageEnd
      previous.summary = `${previous.summary} ${summary}`.trim().slice(0, 300)
      previous.keywords = [...new Set([...previous.keywords, ...next.keywords])].slice(0, 8)
    } else topics.push(next)
  }
  return topics
}

export type RetrievedChunk = MaterialChunk & { materialTitle: string; score: number }

export function retrieveCourseChunks(question: string, materials: Material[], limit = 5): RetrievedChunk[] {
  const query = [...new Set(terms(question))]
  const candidates = materials.filter(material => !material.archivedAt && !material.deletionPending && (material.processingStatus === undefined || material.processingStatus === 'ready' || material.sourceType === 'pdf' && material.analysisStatus === 'partial')).flatMap(material => (material.chunks?.length ? material.chunks : material.text.length <= 15000 && material.text ? chunksForMaterial(material) : [])
    .map(chunk => {
      const chunkTerms = terms(chunk.text)
      const counts = new Map<string, number>()
      for (const term of chunkTerms) counts.set(term, (counts.get(term) ?? 0) + 1)
      const titleTerms = new Set(terms(material.title))
      const score = query.reduce((total, term) => total + Math.min(3, counts.get(term) ?? 0) + (titleTerms.has(term) ? 2 : 0), 0)
      return { ...chunk, materialTitle: material.title, score }
    }))
  return candidates.sort((a, b) => b.score - a.score).slice(0, limit)
}

export function contextForQuestion(question: string, materials: Material[]) {
  const chosen = retrieveCourseChunks(question, materials)
  const context = chosen.map(chunk => {
    const pages = sourceReference(materials.find(material => material.id === chunk.materialId),chunk.pageStart,chunk.pageEnd)
    return `[${chunk.materialTitle} · ${pages}]\n${chunk.text}`
  }).join('\n\n')
  return { context: context.slice(0, 13500), sources: chosen.map(chunk => ({ materialId: chunk.materialId, materialTitle: chunk.materialTitle, pageStart: chunk.pageStart, pageEnd: chunk.pageEnd,
    referenceLabel: sourceReference(materials.find(material => material.id === chunk.materialId),chunk.pageStart,chunk.pageEnd) })) }
}
