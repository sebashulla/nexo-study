import type { Flashcard, Material, QuizQuestion, StudyArtifactType } from '../types'
import { callAI } from './aiClient'
import { chunksForMaterial } from './learningContext'

type JsonRecord = Record<string, unknown>

function record(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null
}

function text(value: unknown, max = 1000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function page(value: unknown) {
  const number = Number(value)
  return Number.isInteger(number) && number > 0 ? number : undefined
}

function parseJson(raw: string): JsonRecord {
  const clean = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  let value: unknown
  try { value = JSON.parse(clean) } catch { throw new Error('Nexo no pudo organizar este material. Inténtalo otra vez.') }
  const parsed = record(value)
  if (!parsed) throw new Error('Nexo devolvió un formato incompleto. Inténtalo otra vez.')
  return parsed
}

export function artifactFlashcards(payload: unknown): Flashcard[] {
  const value = record(payload)
  if (!Array.isArray(value?.cards)) return []
  return value.cards.map(item => {
    const card = record(item)
    const difficulty = text(card?.difficulty)
    return {
      front: text(card?.front, 500), back: text(card?.back, 1500), sourcePage: page(card?.sourcePage),
      concept: text(card?.concept, 120), difficulty: difficulty === 'easy' || difficulty === 'medium' || difficulty === 'hard' ? difficulty : undefined,
    } as Flashcard
  }).filter(card => card.front && card.back).slice(0, 16)
}

export function artifactQuestions(payload: unknown): QuizQuestion[] {
  const value = record(payload)
  if (!Array.isArray(value?.questions)) return []
  return value.questions.map(item => {
    const question = record(item)
    const options = Array.isArray(question?.options) ? question.options.map(option => text(option, 300)).filter(Boolean).slice(0, 4) : []
    const answer = Number(question?.correctOption ?? question?.answer)
    return {
      question: text(question?.question, 700), options,
      answer: Number.isInteger(answer) && answer >= 0 && answer < 4 ? answer : -1,
      explanation: text(question?.explanation, 1000), sourcePage: page(question?.sourcePage), concept: text(question?.concept, 120),
    }
  }).filter(question => question.question && question.options.length === 4 && question.answer >= 0 && question.explanation).slice(0, 12)
}

const promptByType: Record<Exclude<StudyArtifactType, 'summary' | 'exam'>, string> = {
  flashcards: 'Devuelve JSON {"cards":[{"front":"pregunta breve","back":"respuesta precisa","sourcePage":1,"concept":"tema","difficulty":"easy|medium|hard"}]}. Crea entre 6 y 12 tarjetas, cada una con una sola idea.',
  multiple_choice: 'Devuelve JSON {"questions":[{"question":"pregunta","options":["A","B","C","D"],"correctOption":0,"explanation":"explicación basada en el texto","sourcePage":1,"concept":"tema"}]}. Crea entre 5 y 10 preguntas con cuatro opciones plausibles.',
  written_questions: 'Devuelve JSON {"questions":[{"question":"pregunta abierta","keyPoints":["concepto esperado"],"sourcePage":1,"concept":"tema"}]}. Crea entre 4 y 8 preguntas que requieran explicar, comparar o aplicar.',
  fill_blanks: 'Devuelve JSON {"items":[{"sentence":"La ____ cumple una función","answer":"palabra","sourcePage":1,"concept":"tema"}]}. Crea entre 5 y 10 frases con una sola respuesta inequívoca.',
  notes: 'Devuelve JSON {"summary":"síntesis","essentialConcepts":["concepto"],"relationships":["relación"],"examples":["ejemplo del material"],"importantData":["dato"],"selfQuestions":["pregunta"]}. No inventes ejemplos ausentes del material.',
}

function sampledContext(material: Material) {
  const chunks = material.chunks?.length ? material.chunks : material.text.length <= 15000 ? chunksForMaterial(material) : []
  const count = Math.min(chunks.length, 6)
  const chosen = Array.from({ length: count }, (_, index) => chunks[Math.round(index * (chunks.length - 1) / Math.max(1, count - 1))])
  return chosen.map(chunk => `[Página ${chunk.pageStart}${chunk.pageEnd !== chunk.pageStart ? `–${chunk.pageEnd}` : ''}] ${chunk.text}`).join('\n\n').slice(0, 15000)
}

export async function generateArtifactWithAI(courseId: string, courseName: string, material: Material, type: Exclude<StudyArtifactType, 'summary' | 'exam'>): Promise<unknown> {
  const context = sampledContext(material)
  const raw = await callAI({ task: 'artifact', artifactType: type, question:
    `Curso: ${courseName}. Material: ${material.title}.\nGenera únicamente el artefacto solicitado. Usa solo el texto, conserva las páginas y no inventes información.\n${promptByType[type]}\n\nMATERIAL:\n${context}`,
    category: courseName, courseId, materialId: material.id, mode: 'standard', deep: false })
  const parsed = parseJson(raw)
  if (type === 'flashcards') {
    const cards = artifactFlashcards(parsed)
    if (cards.length < 4) throw new Error('Nexo preparó muy pocas tarjetas. Inténtalo otra vez.')
    return { cards }
  }
  if (type === 'multiple_choice') {
    const questions = artifactQuestions(parsed)
    if (questions.length < 4) throw new Error('Nexo preparó muy pocas preguntas. Inténtalo otra vez.')
    return { questions }
  }
  if (type === 'written_questions') {
    const questions = Array.isArray(parsed.questions) ? parsed.questions.map(item => record(item)).filter((item): item is JsonRecord => Boolean(item))
      .map(item => ({ question: text(item.question, 700), keyPoints: Array.isArray(item.keyPoints) ? item.keyPoints.map(point => text(point, 220)).filter(Boolean).slice(0, 8) : [], sourcePage: page(item.sourcePage), concept: text(item.concept, 120) }))
      .filter(item => item.question && item.keyPoints.length).slice(0, 8) : []
    if (questions.length < 3) throw new Error('Nexo preparó muy pocas preguntas escritas. Inténtalo otra vez.')
    return { questions }
  }
  if (type === 'fill_blanks') {
    const items = Array.isArray(parsed.items) ? parsed.items.map(item => record(item)).filter((item): item is JsonRecord => Boolean(item))
      .map(item => ({ sentence: text(item.sentence, 500), answer: text(item.answer, 100), sourcePage: page(item.sourcePage), concept: text(item.concept, 120) }))
      .filter(item => item.sentence.includes('____') && item.answer).slice(0, 10) : []
    if (items.length < 3) throw new Error('Nexo preparó muy pocos ejercicios. Inténtalo otra vez.')
    return { items }
  }
  const notes = {
    summary: text(parsed.summary, 2000),
    essentialConcepts: Array.isArray(parsed.essentialConcepts) ? parsed.essentialConcepts.map(item => text(item, 300)).filter(Boolean).slice(0, 14) : [],
    relationships: Array.isArray(parsed.relationships) ? parsed.relationships.map(item => text(item, 400)).filter(Boolean).slice(0, 10) : [],
    examples: Array.isArray(parsed.examples) ? parsed.examples.map(item => text(item, 400)).filter(Boolean).slice(0, 8) : [],
    importantData: Array.isArray(parsed.importantData) ? parsed.importantData.map(item => text(item, 300)).filter(Boolean).slice(0, 10) : [],
    selfQuestions: Array.isArray(parsed.selfQuestions) ? parsed.selfQuestions.map(item => text(item, 300)).filter(Boolean).slice(0, 10) : [],
  }
  if (!notes.summary || notes.essentialConcepts.length < 2) throw new Error('Nexo no pudo organizar los apuntes. Inténtalo otra vez.')
  return notes
}
