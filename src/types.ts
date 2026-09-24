export type NexoAiMode = 'standard' | 'deep'

export type MaterialPage = { page: number; text: string }
export type ProcessingStatus = 'queued' | 'processing' | 'ready' | 'failed'
export type MaterialChunk = { id: string; materialId: string; pageStart: number; pageEnd: number; text: string; keywords: string[] }
export type MaterialTopic = { id: string; materialId: string; title: string; summary: string; pageStart?: number; pageEnd?: number; keywords: string[] }
export type StudyArtifactType = 'summary' | 'flashcards' | 'multiple_choice' | 'written_questions' | 'fill_blanks' | 'notes' | 'exam'
export type StudyArtifact = {
  id: string
  type: StudyArtifactType
  status: ProcessingStatus
  createdAt: string
  updatedAt: string
  sourceMaterialId: string
  payload: unknown
  version: number
  errorMessage?: string
}
export type LearningStatus = 'unknown' | 'learning' | 'known' | 'mastered'
export type LearningConcept = { key: string; label: string; materialId: string; status: LearningStatus; confidence: number; attempts: number; correctAttempts: number; updatedAt: string }
export type StudySession = { id: string; courseId: string; objective: string; durationMinutes: 15 | 30 | 45; status: 'planned' | 'active' | 'completed'; plan: { type: string; minutes: number; materialId?: string }[]; results: Record<string, number>; createdAt: string; completedAt?: string }

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
  pageCount?: number
  storagePath?: string
  processingStatus?: ProcessingStatus
  processingStage?: 'reading' | 'indexing' | 'saving'
  chunks?: MaterialChunk[]
  topics?: MaterialTopic[]
  artifacts?: StudyArtifact[]
  studyPack?: StudyPack
  studyPackMeta?: StudyPackMeta
}

export type Course = {
  id: string
  name: string
  emoji: string
  materials: Material[]
}

export type Flashcard = { front: string; back: string; sourcePage?: number; concept?: string; difficulty?: 'easy' | 'medium' | 'hard' }

export type QuizQuestion = {
  question: string
  options: string[]
  answer: number
  explanation: string
  sourcePage?: number
  concept?: string
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
