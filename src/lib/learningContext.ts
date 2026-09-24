import type { Material, MaterialChunk, MaterialTopic } from '../types'

const MAX_CHUNK_CHARS = 2600
const STOP_WORDS = new Set('a al algo ante bajo con contra de del desde donde el ella en entre es esta este esto ha hay la las lo los más no o para por que se sin sobre su sus un una unas unos y ya'.split(' '))

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
  const groupSize = Math.max(1, Math.ceil(chunks.length / 18))
  const topics: MaterialTopic[] = []
  for (let index = 0; index < chunks.length; index += groupSize) {
    const group = chunks.slice(index, index + groupSize)
    const text = group.map(chunk => chunk.text).join(' ')
    const firstLine = group[0].text.split(/[.!?]\s/)[0].trim()
    const title = firstLine.length > 12 && firstLine.length < 88 ? firstLine : `Tema ${topics.length + 1}`
    topics.push({
      id: crypto.randomUUID(), materialId: material.id, title, summary: text.slice(0, 280),
      pageStart: group[0].pageStart, pageEnd: group[group.length - 1].pageEnd,
      keywords: keywords(text),
    })
  }
  return topics
}

export type RetrievedChunk = MaterialChunk & { materialTitle: string; score: number }

export function retrieveCourseChunks(question: string, materials: Material[], limit = 5): RetrievedChunk[] {
  const query = [...new Set(terms(question))]
  const candidates = materials.flatMap(material => (material.chunks?.length ? material.chunks : chunksForMaterial(material))
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
    const pages = chunk.pageStart === chunk.pageEnd ? `página ${chunk.pageStart}` : `páginas ${chunk.pageStart}–${chunk.pageEnd}`
    return `[${chunk.materialTitle} · ${pages}]\n${chunk.text}`
  }).join('\n\n')
  return { context: context.slice(0, 13500), sources: chosen.map(chunk => ({ materialId: chunk.materialId, materialTitle: chunk.materialTitle, pageStart: chunk.pageStart, pageEnd: chunk.pageEnd })) }
}
