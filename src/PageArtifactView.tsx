import { useState } from 'react'
import type { StudyArtifact, StudyPack } from './types'
import type { RecallRating } from './lib/learningState'
import { artifactFlashcards, artifactPage, artifactQuestions } from './lib/artifactPrompts'
import { FlashcardView, QuizView } from './PracticeViews'
import { ResponseRenderer } from './ResponseRenderer'

export function PageArtifactView({ artifact, onClose, onRecall, onAnswer, onReveal }: {
  artifact: StudyArtifact; onClose: () => void; onRecall: (label: string, rating: RecallRating) => void
  onAnswer: (label: string, index: number, correct: boolean) => void
  onReveal: (index: number) => void
}) {
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const pack: StudyPack = { summary: [], keywords: [], flashcards: artifactFlashcards(artifact.payload), quiz: artifactQuestions(artifact.payload) }
  const summary = artifact.payload && typeof artifact.payload === 'object' && 'summary' in artifact.payload && typeof artifact.payload.summary === 'string' ? artifact.payload.summary : ''
  return <section className="page-artifact-view"><div className="section-head"><strong>Página {artifactPage(artifact)} · {artifact.type === 'summary' ? 'Resumen' : artifact.type === 'flashcards' ? 'Flashcards' : 'Práctica'}</strong><button className="text-button" onClick={onClose}>Cerrar recurso</button></div>
    {artifact.type === 'summary' && <ResponseRenderer text={summary}/>}
    {artifact.type === 'flashcards' && <FlashcardView pack={pack} index={index} revealed={revealed} setIndex={setIndex} setRevealed={setRevealed} onReveal={onReveal} onRate={(i, rating) => onRecall(pack.flashcards[i].concept || pack.flashcards[i].front, rating)}/>}
    {artifact.type === 'multiple_choice' && <QuizView pack={pack} answers={answers} setAnswers={setAnswers} onAnswer={(i, correct) => onAnswer(pack.quiz[i].concept || pack.quiz[i].question, i, correct)}/>}
  </section>
}
