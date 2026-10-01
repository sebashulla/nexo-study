import type { Material } from '../types'

const MAX_SUMMARY_CHARS = 360

function shorten(text: string) {
  const clean = text.replace(/\[[Pp][áa]gina\s+\d+\]/g, '').replace(/\s+/g, ' ').trim()
  if (clean.length <= MAX_SUMMARY_CHARS) return clean
  const cut = clean.lastIndexOf(' ', MAX_SUMMARY_CHARS - 1)
  return `${clean.slice(0, cut > 240 ? cut : MAX_SUMMARY_CHARS - 1).replace(/[.,;:\s]+$/, '')}…`
}

export function quickSummaryFor(material: Material): string {
  const topics = (material.topics ?? []).filter(topic => topic.title && !/^tema\s+\d+$/i.test(topic.title))
  if (topics.length) {
    const names = topics.slice(0, 3).map(topic => topic.title.replace(/[.!?]+$/, ''))
    const lead = `Contenidos principales: ${names.join(', ')}${topics.length > 3 ? ' y otros conceptos relacionados' : ''}.`
    const detail = topics.map(topic => topic.summary).find(summary => summary && summary.length > 35) ?? ''
    return shorten(`${lead} ${detail}`)
  }
  const payload = material.artifacts?.find(artifact => artifact.type === 'summary' && artifact.status === 'ready')?.payload
  if (payload && typeof payload === 'object' && !Array.isArray(payload) && 'summary' in payload && typeof payload.summary === 'string')
    return shorten(payload.summary)
  return ''
}
