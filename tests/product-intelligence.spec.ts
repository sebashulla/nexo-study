import { expect, test } from '@playwright/test'
import { topicsForMaterial } from '../src/lib/learningContext'
import { quickSummaryFor } from '../src/lib/quickSummary'
import { courseRecommendations } from '../src/lib/productIntelligence'
import type { Course, Material } from '../src/types'

test('topic extraction drops editorial debris and quick summary stays short', () => {
  const material: Material = { id: 'mat-1', title: 'Lupus oral', text: '', createdAt: '2026-01-01T00:00:00Z' }
  const chunks = [
    { id: crypto.randomUUID(), materialId: material.id, pageStart: 1, pageEnd: 1,
      text: '2 Rev Med Inst Mex Seguro Soc. ISSN 1234-5678. https://revista.example/articulo. El lupus eritematoso puede afectar la mucosa oral y requiere evaluación clínica cuidadosa.', keywords: [] },
    { id: crypto.randomUUID(), materialId: material.id, pageStart: 2, pageEnd: 2,
      text: 'Las manifestaciones orales del lupus incluyen lesiones inflamatorias y cambios en la mucosa. La evaluación considera síntomas, historia clínica y hallazgos.', keywords: [] },
  ]
  const topics = topicsForMaterial(material, chunks)
  expect(topics.length).toBeGreaterThan(0)
  expect(topics.every(topic => topic.title && !/Tema \d|Rev Med|ISSN|https?:|copyright/i.test(topic.title))).toBe(true)
  expect(topics.every(topic => topic.pageStart && topic.pageEnd && topic.keywords.length)).toBe(true)
  const summary = quickSummaryFor({ ...material, topics })
  expect(summary.length).toBeLessThanOrEqual(360)
  expect(summary).toMatch(/lupus/i)
  expect(summary).not.toMatch(/Rev Med|ISSN|https?:/i)
})

test('course recommendations use recorded practice, weak concepts and partial analysis', () => {
  const material: Material = { id: 'mat-1', title: 'Electromagnetismo', text: 'Campo eléctrico', createdAt: '2026-01-01T00:00:00Z', sourceType: 'pdf',
    pageCount: 402, analyzedPages: Array.from({ length: 80 }, (_, index) => index + 1), analysisStatus: 'partial', documentKind: 'text' }
  const course: Course = { id: 'course-1', name: 'Física', emoji: '⚛️', materials: [material] }
  const recommendations = courseRecommendations(course, { [material.id]: { summaryViewed: true, lastStudiedAt: '2026-01-02T00:00:00Z' } }, {
    'mat-1:coulomb': { key: 'mat-1:coulomb', label: 'Ley de Coulomb', materialId: material.id, status: 'learning', confidence: .2,
      attempts: 2, correctAttempts: 0, updatedAt: '2026-01-02T00:00:00Z' },
  }, [])
  expect(recommendations.map(item => item.action)).toEqual(['review', 'practice', 'analyze'])
  expect(recommendations[0].text).toContain('1 concepto')
  expect(recommendations[2].text).toContain('80 de 402')
})
