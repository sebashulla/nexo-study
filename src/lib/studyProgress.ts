import type { Course, Material, StudyPack } from '../types'
import { generateStudyPack } from './studyEngine'

export type MaterialActivity = {
  summaryViewed?: boolean
  flashcardsSeen?: number[]
  answers?: Record<string, boolean>
  lastStudiedAt?: string
}

export type StudyActivity = Record<string, MaterialActivity>

const activityKey = (userId: string) => `nexo-study-activity-v1:${userId}`
const fallbackPacks = new WeakMap<Material, StudyPack>()

export function studyPackFor(material: Material) {
  if (material.studyPack) return material.studyPack
  let pack = fallbackPacks.get(material)
  if (!pack) { pack = generateStudyPack(material.text, 10); fallbackPacks.set(material, pack) }
  return pack
}

export function loadStudyActivity(userId: string): StudyActivity {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(activityKey(userId)) || '{}')
    return value && typeof value === 'object' && !Array.isArray(value) ? value as StudyActivity : {}
  } catch { return {} }
}

export function saveStudyActivity(userId: string, activity: StudyActivity) {
  localStorage.setItem(activityKey(userId), JSON.stringify(activity))
}

export function materialProgress(pack: StudyPack | undefined, activity: MaterialActivity | undefined) {
  if (!activity) return 0
  const cards = pack?.flashcards.length ?? 0
  const quiz = pack?.quiz.length ?? 0
  const parts = [activity.summaryViewed ? 1 : 0]
  if (cards) parts.push(Math.min(1, (activity.flashcardsSeen?.filter(index => index >= 0 && index < cards).length ?? 0) / cards))
  if (quiz) {
    const answered = Object.keys(activity.answers ?? {}).filter(key => key.startsWith('quiz:') && Number(key.slice(5)) < quiz).length
    parts.push(Math.min(1, answered / quiz))
  }
  return Math.round(parts.reduce((sum, part) => sum + part, 0) / parts.length * 100)
}

export function workspaceProgress(courses: Course[], activity: StudyActivity) {
  const materials = courses.flatMap(course => course.materials)
  const percentages = materials.map(material => materialProgress(studyPackFor(material), activity[material.id]))
  const answers = materials.flatMap(material => Object.values(activity[material.id]?.answers ?? {}))
  return {
    materials: materials.length,
    started: percentages.filter(value => value > 0).length,
    percent: materials.length ? Math.round(percentages.reduce((sum, value) => sum + value, 0) / materials.length) : 0,
    reviewedCards: materials.reduce((sum, material) => sum + (activity[material.id]?.flashcardsSeen?.length ?? 0), 0),
    answered: answers.length,
    correct: answers.filter(Boolean).length,
  }
}
