import type { StudyPack } from '../types'

const clean = (value: string) => value.replace(/\[Página \d+\]/g, ' ').replace(/\s+/g, ' ').trim()
const stop = new Set('para como este esta estos estas desde hasta entre sobre porque tambien tiene tienen una uno unos unas del las los que con por sus son más mas sin mediante mientras ser se al el la de y o en un es a fue han hay cada puede pueden cual cuando donde muy pero sus según segun'.split(' '))

const sentencesFrom = (text: string) => clean(text).split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 35)
const wordsFrom = (text: string) => clean(text).toLowerCase().replace(/[^a-záéíóúüñ0-9\s-]/gi, ' ').split(/\s+/).filter((word) => word.length > 4 && !stop.has(word))

const keywordsFrom = (text: string, count = 18) => {
  const frequency = new Map<string, number>()
  wordsFrom(text).forEach((word) => frequency.set(word, (frequency.get(word) ?? 0) + 1))
  return [...frequency.entries()].sort((a, b) => b[1] - a[1]).slice(0, count).map(([word]) => word)
}

const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)
const shuffle = <T,>(items: T[], seed: number) => [...items].sort((a, b) => ((String(a).length * 17 + seed) % 13) - ((String(b).length * 19 + seed) % 11))

export function generateStudyPack(rawText: string, quizCount = 8): StudyPack {
  const text = clean(rawText)
  const sentences = sentencesFrom(text)
  const keywords = keywordsFrom(text)
  const scored = sentences.map((sentence, index) => ({
    sentence,
    index,
    score: keywords.slice(0, 10).reduce((n, keyword) => n + (sentence.toLowerCase().includes(keyword) ? 1 : 0), 0)
  }))
  const summary = (scored.length ? scored.sort((a, b) => b.score - a.score || a.index - b.index).slice(0, 6).sort((a, b) => a.index - b.index).map((x) => x.sentence) : [text])
    .map((sentence) => sentence.replace(/\.$/, ''))

  const flashcards = keywords.slice(0, 8).map((keyword) => ({
    front: `¿Qué debes recordar sobre “${cap(keyword)}”?`,
    back: sentences.find((sentence) => sentence.toLowerCase().includes(keyword)) || text
  }))
  while (flashcards.length < 4) {
    const idx = flashcards.length
    flashcards.push({ front: `Idea clave ${idx + 1}`, back: sentences[idx] || text || 'Agrega más contenido.' })
  }

  const pool = sentences.length ? sentences : [text]
  const quiz = Array.from({ length: Math.min(quizCount, Math.max(4, pool.length)) }, (_, index) => {
    const sentence = pool[index % pool.length]
    const key = keywords.find((word) => sentence.toLowerCase().includes(word)) || wordsFrom(sentence)[0] || 'concepto'
    const distractors = keywords.filter((word) => word !== key && !sentence.toLowerCase().includes(word)).slice(index % 5, index % 5 + 3)
    let options = [cap(key), ...distractors.map(cap)]
    while (options.length < 4) options.push(`Concepto alternativo ${options.length}`)
    options = shuffle(options.slice(0, 4), index)
    return {
      question: `Según el material, ¿qué concepto se relaciona mejor con esta afirmación? “${sentence.slice(0, 210)}${sentence.length > 210 ? '…' : ''}”`,
      options,
      answer: options.indexOf(cap(key)),
      explanation: `La afirmación del material se relaciona directamente con “${key}”.`
    }
  })

  return { summary, flashcards, quiz, keywords }
}
