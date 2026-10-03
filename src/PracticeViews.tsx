import { useEffect, useState } from 'react'
import { useMediaQuery } from './hooks/useMediaQuery'
import { useStudyProgress } from './study/StudyFocusShell'
import type { StudyPack } from './types'
import type { RecallRating } from './lib/learningState'
export function FlashcardView({ pack, index, revealed, setIndex, setRevealed, onReveal, onRate }: { pack: StudyPack; index: number; revealed: boolean; setIndex: (n: number) => void; setRevealed: (v: boolean) => void; onReveal: (index: number) => void; onRate: (index: number, rating: RecallRating) => void }) {
  const safeIndex = Math.min(index, Math.max(0, pack.flashcards.length - 1))
  const card = pack.flashcards[safeIndex]
  useStudyProgress(card ? `${safeIndex + 1} / ${pack.flashcards.length}` : '')
  const move = (delta: number) => { if (!pack.flashcards.length) return; setIndex((safeIndex + delta + pack.flashcards.length) % pack.flashcards.length); setRevealed(false) }
  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (target.closest('input, textarea, select, dialog, [role="menu"], [contenteditable="true"]')) return
      if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1) }
      if (event.key === 'ArrowRight') { event.preventDefault(); move(1) }
    }
    window.addEventListener('keydown', keys)
    return () => window.removeEventListener('keydown', keys)
  }, [safeIndex, pack.flashcards.length, setIndex, setRevealed])
  if (!card) return <div className="tutor-empty"><span>✦</span><p>No hay flashcards disponibles todavía.</p></div>
  return <div className="flash-wrap"><p className="counter">Tarjeta {safeIndex + 1} de {pack.flashcards.length}{card.sourcePage ? ` · Página ${card.sourcePage}` : ''}</p><button className={`flashcard ${revealed ? 'revealed' : ''}`} onClick={() => { if (!revealed) onReveal(safeIndex); setRevealed(!revealed) }}><small>{revealed ? 'RESPUESTA' : 'PREGUNTA'}</small><strong>{revealed ? card.back : card.front}</strong><span>{revealed ? 'Toca para volver' : 'Toca para revelar'}</span></button>{revealed && <div className="flash-rating" role="group" aria-label="¿Cómo recordaste esta tarjeta?">{([['again', 'No sabía'], ['hard', 'Difícil'], ['good', 'Bien'], ['easy', 'Fácil']] as [RecallRating, string][]).map(([rating, label]) => <button key={rating} className="secondary" onClick={() => { onRate(safeIndex, rating); move(1) }}>{label}</button>)}</div>}<div className="flash-controls"><button className="secondary" onClick={() => move(-1)}>← Anterior</button><button className="primary" onClick={() => move(1)}>Siguiente →</button></div></div>
}

export function QuizView({ pack, answers, setAnswers, onAnswer }: { pack: StudyPack; answers: Record<number, number>; setAnswers: (value: Record<number, number>) => void; onAnswer: (index: number, correct: boolean) => void }) {
  const mobile = useMediaQuery('(max-width: 700px)')
  const [index, setIndex] = useState(0)
  const [finished, setFinished] = useState(false)
  useStudyProgress(finished ? 'Resultados' : pack.quiz.length ? `${Math.min(index + 1, pack.quiz.length)} / ${pack.quiz.length}` : '')
  const reset = () => { setAnswers({}); setIndex(0); setFinished(false) }
  const answered = Object.keys(answers).length
  const correct = Object.entries(answers).filter(([i, a]) => pack.quiz[Number(i)]?.answer === a).length
  return <div className="quiz-list"><div className="quiz-toolbar"><div><p className="eyebrow">Práctica a tu ritmo</p><h3>Quiz del material</h3></div><div className="quiz-toolbar-actions"><div className="score-chip">{answered}/{pack.quiz.length} · {answered ? Math.round(correct / answered * 100) : 0}%</div>{answered > 0 && <button className="secondary quiz-reset" onClick={reset}>Practicar de nuevo</button>}</div></div>{finished && mobile ? <div className="quiz-result"><h3>Práctica terminada</h3><p>{correct} de {pack.quiz.length} respuestas correctas. Tu progreso ya está actualizado.</p></div> : pack.quiz.map((question, qi) => { if (mobile && qi !== Math.min(index, pack.quiz.length - 1)) return null; const selected = answers[qi]; const done = selected !== undefined; return <article className="quiz-card" key={qi}><div className="question-number">Pregunta {qi + 1}{question.sourcePage ? ` · pág. ${question.sourcePage}` : ''}</div><h3>{question.question}</h3><div className="options">{question.options.map((option, oi) => { const ok = done && oi === question.answer; const wrong = done && oi === selected && oi !== question.answer; return <button disabled={done} className={`${ok ? 'correct' : ''} ${wrong ? 'wrong' : ''}`} key={oi} onClick={() => { onAnswer(qi, oi === question.answer); setAnswers({ ...answers, [qi]: oi }) }}><span>{String.fromCharCode(65 + oi)}</span>{option}</button> })}</div>{done && <div className={`feedback ${selected === question.answer ? 'ok' : 'no'}`}><strong>{selected === question.answer ? '✓ Correcto' : '✕ Revisa esta idea'}</strong><p>{question.explanation}</p>{question.sourcePage && <small>Fuente: página {question.sourcePage}</small>}</div>}{mobile && done && <button className="primary quiz-continue" onClick={() => { if (qi + 1 >= pack.quiz.length) setFinished(true); else setIndex(qi + 1) }}>{qi + 1 >= pack.quiz.length ? 'Ver resultado' : 'Continuar →'}</button>}</article>})}</div>
}
