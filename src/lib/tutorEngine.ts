import type { Material, TutorAnswer } from '../types'

const normalize = (text: string) => text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const tokens = (text: string) => normalize(text).replace(/[^a-z0-9ñ\s]/g, ' ').split(/\s+/).filter((w) => w.length > 3)

export function askMaterial(material: Material, question: string): TutorAnswer {
  const qTokens = [...new Set(tokens(question))]
  if (!qTokens.length) return { answer: 'Escribe una pregunta un poco más específica sobre este material.', citations: [], confidence: 'baja' }

  const chunks = (material.pages?.length ? material.pages : [{ page: undefined, text: material.text }])
    .flatMap((page) => page.text.split(/(?<=[.!?])\s+/).map((text) => ({ page: page.page, text: text.trim() })))
    .filter((chunk) => chunk.text.length > 25)
    .map((chunk) => {
      const hay = tokens(chunk.text)
      const score = qTokens.reduce((sum, token) => sum + (hay.includes(token) ? 2 : hay.some((w) => w.includes(token) || token.includes(w)) ? 0.7 : 0), 0)
      return { ...chunk, score }
    })
    .sort((a, b) => b.score - a.score)

  const matches = chunks.filter((chunk) => chunk.score > 0).slice(0, 3)
  if (!matches.length) {
    return {
      answer: 'No encuentro una respuesta clara dentro del material cargado. Prueba usando términos que aparezcan en tus apuntes.',
      citations: [], confidence: 'baja'
    }
  }

  const best = matches[0]
  const confidence = best.score >= 4 ? 'alta' : best.score >= 2 ? 'media' : 'baja'
  const answer = matches.map((m) => m.text).join(' ')
  return {
    answer,
    confidence,
    citations: matches.map((m) => ({ page: m.page, excerpt: m.text.slice(0, 190) }))
  }
}
