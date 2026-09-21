export type NexoAiMode = 'standard' | 'deep'

export type MaterialPage = { page: number; text: string }

export type StudyFocus = 'balanced' | 'understand' | 'memorize' | 'exam'
export type StudyLevel = 'essential' | 'university' | 'advanced'

export type StudyPackMeta = {
  source: 'nexo-ai' | 'local'
  generatedAt: string
  focus: StudyFocus
  level: StudyLevel
  sampledPages?: number[]
}

export type Material = {
  id: string
  title: string
  text: string
  createdAt: string
  sourceType?: 'text' | 'pdf'
  sourceName?: string
  pages?: MaterialPage[]
  studyPack?: StudyPack
  studyPackMeta?: StudyPackMeta
}

export type Course = {
  id: string
  name: string
  emoji: string
  materials: Material[]
}

export type Flashcard = { front: string; back: string; sourcePage?: number }

export type QuizQuestion = {
  question: string
  options: string[]
  answer: number
  explanation: string
  sourcePage?: number
}

export type StudyPack = {
  summary: string[]
  flashcards: Flashcard[]
  quiz: QuizQuestion[]
  keywords: string[]
}

export type TutorAnswer = {
  answer: string
  citations: { page?: number; excerpt: string }[]
  confidence: 'alta' | 'media' | 'baja'
}
