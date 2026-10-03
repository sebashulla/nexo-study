export type NexoAiMode = 'standard' | 'deep'

export type SolutionAttachment = { storagePath: string; mimeType: 'image/png' | 'image/jpeg' | 'image/webp'; name: string; bytes: number }
export type SavedSolution = {
  id: string; userId: string; courseId: string; question: string; answer: string; category: string
  createdAt: string; updatedAt: string; source: 'resolver'; sourceKey: string; attachments: SolutionAttachment[]
}
export type SolutionDraft = {
  question: string; answer: string; category: string; sourceKey: string
  images: import('./lib/imageUtils').ImageAttachment[]; expectedImages: number
}

export type SourceType = 'pdf' | 'image' | 'docx' | 'pptx' | 'text' | 'web' | 'youtube' | 'note'
export type SourceBlock = { kind: 'heading' | 'paragraph' | 'list' | 'table' | 'notes'; text: string; level?: number }
// The numeric page remains a stable unit ordinal for the existing chunk/FK contract.
export type MaterialPage = { page: number; text: string; heading?: string; timestamp?: number; blocks?: SourceBlock[] }
export type SourceMetadata = { sourceUrl?: string; mimeType?: string; originalFilename?: string; videoId?: string;
  author?: string; extractedAt?: string; extraction?: string; units?: { page: number; heading?: string; timestamp?: number }[] }
export type NormalizedDocument = { title: string; plainText: string; sections: MaterialPage[]; sourceMetadata: SourceMetadata; partial?: boolean; warning?: string }
export type ProcessingStatus = 'queued' | 'processing' | 'ready' | 'failed'
export type DocumentKind = 'text' | 'scan' | 'mixed' | 'unknown'
export type AnalysisStatus = 'not_started' | 'reading' | 'indexing' | 'ready' | 'partial' | 'failed'
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
export type LearningConcept = { key: string; label: string; materialId: string; status: LearningStatus; confidence: number; attempts: number; correctAttempts: number; updatedAt: string;
  pendingEvidenceIds?: string[]; evidenceManaged?: boolean; evidenceCount?: number; lastSeen?: string; lastPracticed?: string; lastResult?: string; legacyAttempts?: number }
export type StudySession = { id: string; courseId: string; objective: string; durationMinutes: 15 | 30 | 45; status: 'planned' | 'active' | 'completed'; plan: { type: string; minutes: number; materialId?: string }[]; results: Record<string, number>; createdAt: string; completedAt?: string }
export type StudySessionEvent = { id: string; sessionId: string; activityType: 'flashcard_answer' | 'quiz_answer' | 'written_answer' | 'session_complete'; materialId?: string; result: { correct?: boolean; rating?: string }; createdAt: string }

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
  sourceType?: SourceType
  sourceName?: string
  sourceMetadata?: SourceMetadata
  processingError?: string
  archivedAt?: string
  deletionPending?: boolean
  sourceRevision?: number
  pages?: MaterialPage[]
  pageCount?: number
  pdfBytes?: number
  pdfTitle?: string
  pdfAuthor?: string
  documentKind?: DocumentKind
  analysisStatus?: AnalysisStatus
  analyzedPages?: number[]
  analysisProgress?: { completed: number; total: number; currentPage: number }
  remotePlaceholder?: boolean
  contextLoaded?: boolean
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
  deletionPending?: boolean
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
