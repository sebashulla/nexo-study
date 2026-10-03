import { useState } from 'react'
import { StudyFocusShell } from './study/StudyFocusShell'
import type { QuizQuestion, StudyArtifact, StudyPack } from './types'
import type { RecallRating } from './lib/learningState'
import { artifactFlashcards, artifactPage, artifactQuestions } from './lib/artifactPrompts'
import { FlashcardView, QuizView } from './PracticeViews'
import { artifactConcept } from './lib/artifactScope'
import { ResponseRenderer } from './ResponseRenderer'

export function PageArtifactView({ artifact, onClose, onRecall, onAnswer, onReveal, onAsk }: {
  artifact: StudyArtifact; onClose: () => void; onRecall: (label: string, rating: RecallRating) => void
  onAnswer: (label: string, index: number, correct: boolean) => void
  onReveal: (index: number) => void
  onAsk?: (question: QuizQuestion, selected: number) => void
}) {
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const pack: StudyPack = { summary: [], keywords: [], flashcards: artifactFlashcards(artifact.payload), quiz: artifactQuestions(artifact.payload) }
  const summary = artifact.payload && typeof artifact.payload === 'object' && 'summary' in artifact.payload && typeof artifact.payload.summary === 'string' ? artifact.payload.summary : ''
  return <StudyFocusShell title={artifact.type === 'flashcards' ? 'Flashcards' : 'Quiz'} onBack={onClose} enabled={artifact.type !== 'summary'}><section className="page-artifact-view"><div className="section-head"><strong>{artifactPage(artifact) ? `Página ${artifactPage(artifact)}` : artifactConcept(artifact) ?? 'Material completo'} · {artifact.type === 'summary' ? 'Resumen' : artifact.type === 'flashcards' ? 'Flashcards' : 'Práctica'}</strong><button className="text-button" onClick={onClose}>Cerrar recurso</button></div>
    {artifact.type === 'summary' && <ResponseRenderer text={summary}/>}
    {artifact.type === 'flashcards' && <FlashcardView pack={pack} index={index} revealed={revealed} setIndex={setIndex} setRevealed={setRevealed} onReveal={onReveal} onRate={(i, rating) => onRecall(pack.flashcards[i].concept || pack.flashcards[i].front, rating)}/>}
    {artifact.type === 'multiple_choice' && <QuizView pack={pack} answers={answers} setAnswers={setAnswers} onAnswer={(i, correct) => onAnswer(pack.quiz[i].concept || pack.quiz[i].question, i, correct)} onAsk={onAsk ? (index, selected) => onAsk(pack.quiz[index], selected) : undefined}/>}
  </section></StudyFocusShell>
}
