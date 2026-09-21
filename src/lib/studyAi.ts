import type { Material, MaterialPage, StudyFocus, StudyLevel, StudyPack } from '../types'
import { callAI } from './aiClient'

const MAX_CONTEXT_CHARS = 43000

const focusLabels: Record<StudyFocus, string> = {
  balanced: 'equilibrado: comprensión + memoria + práctica',
  understand: 'comprender relaciones, mecanismos, causas y diferencias',
  memorize: 'memorizar términos, definiciones, clasificaciones y datos clave',
  exam: 'preparación para examen universitario, priorizando discriminación entre alternativas y errores frecuentes',
}

const levelLabels: Record<StudyLevel, string> = {
  essential: 'esencial y directo, sin detalles secundarios',
  university: 'universitario estándar, con precisión conceptual',
  advanced: 'avanzado, conectando conceptos y matices importantes',
}

function takePageSample(pages: MaterialPage[]) {
  if (!pages.length) return { text: '', sampledPages: [] as number[] }
  const perPageBudget = Math.max(700, Math.floor(MAX_CONTEXT_CHARS / Math.min(pages.length, 28)))
  const desiredCount = Math.min(pages.length, Math.max(8, Math.floor(MAX_CONTEXT_CHARS / perPageBudget)))
  const indices = new Set<number>()
  if (desiredCount >= pages.length) pages.forEach((_, index) => indices.add(index))
  else {
    for (let i = 0; i < desiredCount; i += 1) {
      indices.add(Math.round((i * (pages.length - 1)) / Math.max(1, desiredCount - 1)))
    }
  }
  const selected = [...indices].sort((a, b) => a - b).map(index => pages[index])
  let used = 0
  const chunks: string[] = []
  const sampledPages: number[] = []
  for (const page of selected) {
    if (used >= MAX_CONTEXT_CHARS) break
    const room = MAX_CONTEXT_CHARS - used
    const slice = page.text.slice(0, Math.min(room, perPageBudget))
    if (!slice.trim()) continue
    chunks.push(`[Página ${page.page}] ${slice}`)
    sampledPages.push(page.page)
    used += slice.length
  }
  return { text: chunks.join('\n\n'), sampledPages }
}

export function buildStudyContext(material: Material) {
  if (material.pages?.length) return takePageSample(material.pages)
  return { text: material.text.slice(0, MAX_CONTEXT_CHARS), sampledPages: [] as number[] }
}

function cleanJson(raw: string) {
  return raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
}

type RawRecord = Record<string, unknown>

function asRecord(val: unknown): RawRecord | null {
  return typeof val === 'object' && val !== null ? (val as RawRecord) : null
}

function normalizeStudyPack(value: unknown): StudyPack {
  const data = asRecord(value)
  const rawSummary = Array.isArray(data?.summary) ? data.summary : []
  const summary = rawSummary.map(item => String(item ?? '').trim()).filter(Boolean).slice(0, 8)

  const rawKeywords = Array.isArray(data?.keywords) ? data.keywords : []
  const keywords = rawKeywords.map(item => String(item ?? '').trim()).filter(Boolean).slice(0, 14)

  const rawFlashcards = Array.isArray(data?.flashcards) ? data.flashcards : []
  const flashcards = rawFlashcards
    .map(item => {
      const card = asRecord(item)
      const front = String(card?.front ?? '').trim()
      const back = String(card?.back ?? '').trim()
      const rawPage = Number(card?.sourcePage)
      const sourcePage = Number.isFinite(rawPage) && rawPage > 0 ? Math.trunc(rawPage) : undefined
      return { front, back, sourcePage }
    })
    .filter(item => Boolean(item.front && item.back))
    .slice(0, 16)

  const rawQuiz = Array.isArray(data?.quiz) ? data.quiz : []
  const quiz = rawQuiz
    .map(item => {
      const q = asRecord(item)
      const options = Array.isArray(q?.options)
        ? q.options.map(option => String(option ?? '').trim()).filter(Boolean).slice(0, 4)
        : []
      const answer = Number(q?.answer)
      const rawPage = Number(q?.sourcePage)
      const sourcePage = Number.isFinite(rawPage) && rawPage > 0 ? Math.trunc(rawPage) : undefined
      return {
        question: String(q?.question ?? '').trim(),
        options,
        answer: Number.isInteger(answer) && answer >= 0 && answer < options.length ? answer : 0,
        explanation: String(q?.explanation ?? '').trim(),
        sourcePage,
      }
    })
    .filter(item => Boolean(item.question && item.options.length === 4 && item.explanation))
    .slice(0, 12)

  if (summary.length < 3 || flashcards.length < 6 || quiz.length < 5) throw new Error('Nexo IA devolvió un paquete incompleto. Intenta generarlo nuevamente.')
  return { summary, keywords, flashcards, quiz }
}

export async function generateStudyPackWithAI({
  courseName,
  material,
  focus,
  level,
}: {
  courseName: string
  material: Material
  focus: StudyFocus
  level: StudyLevel
}) {
  const { text, sampledPages } = buildStudyContext(material)
  const prompt = `Analiza este material del curso "${courseName}" y conviértelo en un paquete de estudio útil.\n\nObjetivo de estudio: ${focusLabels[focus]}.\nNivel: ${levelLabels[level]}.\n\nDevuelve exclusivamente un objeto JSON con esta forma exacta:\n{\n  "summary": ["6 a 8 ideas clave, autosuficientes y concretas"],\n  "keywords": ["8 a 12 conceptos importantes"],\n  "flashcards": [\n    {"front":"pregunta breve","back":"respuesta clara y completa","sourcePage":1}\n  ],\n  "quiz": [\n    {"question":"pregunta","options":["A","B","C","D"],"answer":0,"explanation":"por qué esa alternativa es correcta","sourcePage":1}\n  ]\n}\n\nREQUISITOS:\n- Crea 12 flashcards y 10 preguntas de quiz cuando el contenido lo permita.\n- Las preguntas deben medir comprensión, no solo copiar frases.\n- Evita distractores absurdos o ambiguos.\n- No inventes hechos ausentes del material.\n- sourcePage debe ser la página del material que respalda esa tarjeta/pregunta cuando exista; si no se puede determinar, omítelo.\n- No agregues Markdown, comentarios ni texto fuera del JSON.\n\nMATERIAL:\n${text}`

  const raw = await callAI({ task: 'study_pack', question: prompt, category: courseName, mode: 'standard', deep: false })
  let parsed: unknown
  try { parsed = JSON.parse(cleanJson(raw)) } catch { throw new Error('No se pudo interpretar el paquete generado por Nexo IA. Intenta nuevamente.') }
  return { pack: normalizeStudyPack(parsed), sampledPages }
}
