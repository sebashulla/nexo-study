import { expect, test, type Page } from '@playwright/test'
import { navigateSection } from './helpers/navigation'
import { academicMock, login, png, user } from './helpers/academicMock'
import { todayActions } from '../src/lib/productIntelligence'
import { applyRecall, masterySummary } from '../src/lib/learningState'
import { analysisPages } from '../src/lib/pageActions'
import type { Course, StudySession } from '../src/types'

const course: Course = { id: 'course-cohesion', name: 'Física de prueba', emoji: '⚛️', materials: [{ id: 'material-pages', title: 'Coulomb y energía', sourceType: 'pdf', sourceName: 'fisica.pdf', pageCount: 4, analysisStatus: 'ready', analyzedPages: [1, 2, 3, 4], createdAt: '2026-09-29T10:00:00Z', text: 'La fuerza de Coulomb depende de la carga. La energía cinética depende de la velocidad.',
  pages: [ { page: 1, text: 'MARCADOR_PAGINA_UNO: La fuerza eléctrica de Coulomb.' }, { page: 2, text: 'MARCADOR_PAGINA_DOS: La energía cinética depende de la masa y del cuadrado de la velocidad.' } ],
  chunks: [ { id: '10000000-0000-4000-8000-000000000001', materialId: 'material-pages', pageStart: 1, pageEnd: 1, text: 'MARCADOR_PAGINA_UNO: La fuerza eléctrica de Coulomb.', keywords: ['Coulomb'] }, { id: '10000000-0000-4000-8000-000000000002', materialId: 'material-pages', pageStart: 2, pageEnd: 2, text: 'MARCADOR_PAGINA_DOS: La energía cinética depende de la masa y del cuadrado de la velocidad.', keywords: ['energía'] } ] }] }

async function resolve(page: Page, images = 0) {
  await page.goto('/resolver')
  if (images) await page.locator('.solver-composer input[type="file"]').setInputFiles(Array.from({ length: images }, (_, index) => ({ name: `ejercicio${index}.png`, mimeType: 'image/png', buffer: png })))
  await page.getByRole('textbox', { name: 'Escribe tu pregunta' }).fill('¿Qué es la energía cinética?')
  await page.getByRole('button', { name: 'Enviar pregunta' }).click()
  await expect(page.locator('.solver-assistant-bubble')).toContainText('Depende de la masa')
}

test('Resolver saves multiple private images, restores library, deduplicates and searches the solution', async ({ page }) => {
  const mock = await academicMock(page)
  mock.seedCourse(course)
  let modelCalls = 0
  await page.route('**/api/ai/solve', route => { modelCalls++; return route.fulfill({ json: { text: 'Depende de la masa y del cuadrado de la velocidad.' } }) })
  await login(page)
  expect(mock.requests.filter(item => item.table === 'saved_solutions')).toHaveLength(0)
  await resolve(page, 2)
  // Unsaved images survive a refresh without large localStorage records.
  await page.reload()
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  let dialog = page.getByRole('dialog', { name: 'Guardar en curso' })
  await expect(dialog.getByRole('button', { name: 'Guardar solución' })).toBeDisabled()
  await dialog.getByRole('button', { name: /Física de prueba/ }).click()
  await dialog.getByRole('button', { name: 'Guardar solución' }).click()
  await expect(page).toHaveURL(/\/courses\/course-cohesion\/library$/)
  dialog = page.getByRole('dialog', { name: 'Solución guardada' })
  await expect(dialog).toContainText('Depende de la masa')
  await expect(dialog.locator('img')).toHaveCount(2)
  const solutions = mock.rows.get('saved_solutions')!
  expect(solutions.size).toBe(1)
  const saved = [...solutions.values()][0]
  expect(saved.status).toBe('ready')
  expect(saved.user_id).toBe(user.id)
  expect(JSON.stringify(saved)).not.toMatch(/data:image|base64/)
  expect(mock.uploaded).toHaveLength(2)
  expect(mock.uploaded.every(path => path.startsWith(`${user.id}/${course.id}/solutions/${saved.id}/`))).toBe(true)
  expect(new Set(mock.signed).size).toBe(2)
  expect(modelCalls).toBe(1)
  await dialog.getByRole('button', { name: 'Cerrar diálogo' }).click()
  await page.reload()
  await page.getByRole('group', { name: 'Filtrar biblioteca' }).getByRole('button', { name: 'Soluciones', exact: true }).click()
  await expect(page.locator('.library-entry')).toContainText('¿Qué es la energía cinética?')
  await page.goto('/resolver')
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  dialog = page.getByRole('dialog', { name: 'Guardar en curso' })
  await dialog.getByRole('button', { name: /Física de prueba/ }).click()
  await dialog.getByRole('button', { name: 'Guardar solución' }).click()
  await expect(page.getByRole('dialog', { name: 'Solución guardada' })).toBeVisible()
  expect(solutions.size).toBe(1)
  expect(mock.uploaded).toHaveLength(2)
  await page.getByRole('button', { name: 'Cerrar diálogo' }).click()
  await page.keyboard.press('Control+k')
  dialog = page.getByRole('dialog', { name: 'Buscar en Nexo Study' })
  await dialog.getByRole('combobox').fill('energía cinética')
  await dialog.locator('.global-search-results button').filter({ hasText: 'Física de prueba' }).filter({ hasText: '¿Qué es la energía cinética?' }).click()
  dialog = page.getByRole('dialog', { name: 'Solución guardada' })
  await dialog.getByRole('button', { name: 'Practicar este concepto' }).click()
  await expect(page).toHaveURL(/\/courses\/course-cohesion\/ai$/)
  await expect(page.getByRole('textbox', { name: 'Preguntar sobre el curso' })).toHaveValue(/energía cinética/)
  await expect(page.locator('.chat-page-context')).toContainText('solución guardada')
  await page.goto(`/courses/${course.id}/library`)
  await page.getByRole('group', { name: 'Filtrar biblioteca' }).getByRole('button', { name: 'Soluciones', exact: true }).click()
  await page.locator('.library-entry').click()
  dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Eliminar', exact: true }).click()
  await dialog.getByRole('button', { name: 'Eliminar definitivamente' }).click()
  await expect(dialog).toHaveCount(0)
  expect(solutions.size).toBe(0)
  expect(mock.removed).toEqual(mock.uploaded)
})

test('save can create its course and a failed image upload rolls back instead of showing success', async ({ page }) => {
  const mock = await academicMock(page)
  await page.route('**/api/ai/solve', route => route.fulfill({ json: { text: 'Depende de la masa y de la velocidad.' } }))
  await login(page)
  await resolve(page, 2)
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Guardar en curso' })
  await dialog.getByRole('button', { name: '+ Crear nuevo curso', exact: true }).click()
  await dialog.getByLabel('Nombre del nuevo curso').fill('Mecánica guardada')
  mock.control.failUpload = 2
  await dialog.getByRole('button', { name: 'Guardar solución' }).click()
  await expect(dialog.getByRole('alert')).toBeVisible()
  expect(mock.rows.get('saved_solutions')?.size).toBe(0)
  expect(mock.removed).toEqual(mock.uploaded)
  await expect(page.getByRole('dialog', { name: 'Solución guardada' })).toHaveCount(0)
  mock.control.failUpload = 0
  await dialog.getByRole('button', { name: 'Guardar solución' }).click()
  await expect(page.getByRole('dialog', { name: 'Solución guardada' })).toBeVisible()
  expect([...mock.rows.get('courses')!.values()].filter(row => row.name === 'Mecánica guardada')).toHaveLength(1)
})

test('page chat and cached artifacts use only the chosen page; errors update the learning loop immediately', async ({ page }) => {
  const mock = await academicMock(page)
  mock.seedCourse(course)
  const payloads: Record<string, unknown>[] = []
  await page.route('**/api/ai/solve', route => {
    const payload = route.request().postDataJSON()
    payloads.push(payload)
    const text = payload.task !== 'artifact' ? 'Esta página trata de energía cinética.' : payload.artifactType === 'summary' ? JSON.stringify({ summary: 'La energía cinética relaciona masa y velocidad.' }) : payload.artifactType === 'flashcards' ? JSON.stringify({ cards: Array.from({ length: 3 }, (_, i) => ({ front: `Pregunta ${i + 1}`, back: 'Masa y velocidad', concept: 'Energía cinética', sourcePage: 2 })) }) : JSON.stringify({ questions: Array.from({ length: 5 }, (_, i) => ({ question: `Energía cinética ${i + 1}`, options: ['Masa y velocidad', 'Solo volumen', 'Solo temperatura', 'Solo carga'], correctOption: 0, explanation: 'Depende de masa y velocidad.', concept: 'Energía cinética', sourcePage: 2 })) })
    return route.fulfill({ json: { text } })
  })
  await login(page)
  await page.goto(`/courses/${course.id}/materials/material-pages/workspace`)
  await page.getByRole('spinbutton', { name: 'Página del documento' }).fill('2')
  await page.locator('.page-context-tools summary').click()
  await page.locator('.page-context-tools').getByRole('button', { name: 'Preguntar a Nexo' }).click()
  await expect(page.locator('.page-chat-context')).toContainText('Página 2')
  await page.getByRole('textbox', { name: 'Preguntar sobre este material' }).fill('¿Qué aprenderé aquí?')
  await page.locator('.material-chat-composer').getByRole('button', { name: 'Preguntar a Nexo' }).click()
  await expect(page.locator('.material-chat-answer')).toContainText('energía cinética')
  expect(payloads[0].page).toBe(2)
  expect(payloads[0].materialId).toBe('material-pages')
  expect(payloads[0].context).toContain('MARCADOR_PAGINA_DOS')
  expect(payloads[0].context).not.toContain('MARCADOR_PAGINA_UNO')
  for (const action of ['Resumir página', 'Crear tarjetas', 'Crear preguntas']) {
    await page.locator('.page-context-tools').getByRole('button', { name: action }).click()
    await expect(page.locator('.page-artifact-view')).toContainText('Página 2')
    if (page.viewportSize()!.width <= 700 && action !== 'Resumir página') await page.getByRole('button', { name: 'Volver al material o curso' }).click()
    await expect(page.locator('.page-context-tools').getByRole('button', { name: action })).toBeEnabled()
  }
  for (const payload of payloads.filter(item => item.task === 'artifact')) {
    expect(payload.page).toBe(2)
    expect(payload.question).toContain('MARCADOR_PAGINA_DOS')
    expect(payload.question).not.toContain('MARCADOR_PAGINA_UNO')
  }
  await page.locator('.page-context-tools').getByRole('button', { name: 'Crear preguntas' }).click()
  expect(payloads.filter(item => item.task === 'artifact')).toHaveLength(3)
  await expect(page.locator('.page-artifact-view .quiz-card')).toHaveCount(page.viewportSize()!.width <= 700 ? 1 : 5)
  await page.locator('.page-artifact-view .quiz-card').first().getByRole('button', { name: /Solo volumen/ }).click()
  if (page.viewportSize()!.width <= 700) await page.getByRole('button', { name: 'Volver al material o curso' }).click()
  await page.getByRole('button', { name: /← Física de prueba/ }).click()
  await expect(page.locator('.course-recommendations')).toContainText('repaso')
  await navigateSection(page, 'Inicio')
  await expect(page.locator('.hero-card')).toHaveCount(0)
  await expect(page.locator('.home-today')).toContainText('conceptos por reforzar')
  await navigateSection(page, 'Progreso')
  await expect(page.locator('.progress-focus')).toContainText('Energía cinética')
  await expect(page.locator('.stat-card').filter({ hasText: 'Dominio estimado' })).toContainText('Sin datos suficientes')
  await expect(page.locator('.progress-recent')).toContainText('1 preguntas respondidas')
  await page.goto(`/courses/${course.id}/library`)
  await page.getByRole('group', { name: 'Filtrar biblioteca' }).getByRole('button', { name: 'Flashcards', exact: true }).click()
  await page.locator('.library-entry').click()
  await expect(page.locator('.page-artifact-view')).toContainText('Página 2 · Flashcards')
  await page.locator('.page-artifact-view .flashcard').click()
  await page.getByRole('button', { name: 'Difícil', exact: true }).click()
  if (page.viewportSize()!.width <= 700) await page.getByRole('button', { name: 'Volver al material o curso' }).click()
  await page.getByRole('button', { name: /← Física de prueba/ }).click()
  await navigateSection(page, 'Progreso')
  await expect(page.locator('.stat-card').filter({ hasText: 'Tarjetas repasadas' })).toContainText('1')
})

test('Today has stable priorities and mastery never invents evidence; analysis selection is bounded', () => {
  const mat = course.materials[0]
  const activity = { [mat.id]: { summaryViewed: true, lastStudiedAt: mat.createdAt } }
  const session: StudySession = { id: 'pending', courseId: course.id, objective: 'weak', durationMinutes: 15, status: 'active', plan: [], results: {}, createdAt: mat.createdAt }
  const memory = applyRecall({}, mat.id, 'Energía cinética', 'again')
  const actions = todayActions([course], activity, memory, [session])
  expect(actions.map(item => item.action)).toEqual(['session', 'review'])
  expect(actions).toEqual(todayActions([course], activity, memory, [session]))
  expect(actions.length).toBeLessThanOrEqual(3)
  expect(todayActions([course], {}, {}, [])).toEqual([])
  expect(masterySummary({}, [mat.id]).sufficient).toBe(false)
  expect(masterySummary(memory, [mat.id]).sufficient).toBe(false)
  expect(masterySummary(applyRecall(applyRecall(memory, mat.id, 'Energía cinética', 'good'), mat.id, 'Energía cinética', 'easy'), [mat.id]).sufficient).toBe(true)
  const large = { ...mat, pageCount: 402, analyzedPages: Array.from({ length: 80 }, (_, i) => i + 1) }
  expect(analysisPages(large, 40)).toEqual(Array.from({ length: 40 }, (_, i) => i + 81))
  expect(analysisPages(large, 80)).toHaveLength(80)
  expect(analysisPages(large, 'all')).toHaveLength(322)
  expect(analysisPages(large, 'range', 78, 84)).toEqual([81, 82, 83, 84])
  expect(() => analysisPages(large, 'range', 10, 4)).toThrow()
  expect(() => analysisPages(large, 'range', 1, 403)).toThrow()
})

test('Home restores real activity on a new browser without fetching all document content', async ({ page }) => {
  const mock = await academicMock(page)
  mock.seedCourse(course)
  mock.rows.set('study_progress', new Map([['material-pages', { user_id: user.id, course_id: course.id, material_id: 'material-pages', activity: { summaryViewed: true, lastStudiedAt: '2026-09-29T15:00:00Z' } }]]))
  mock.rows.set('learning_state', new Map([['energy', { user_id: user.id, course_id: course.id, material_id: 'material-pages', concept_key: 'energia', concept_label: 'Energía cinética', attempts: 1, correct_attempts: 0, confidence: .1, status: 'learning', updated_at: '2026-09-29T15:00:00Z' }]]))
  await login(page)
  await expect(page.locator('.home-today')).toContainText('Coulomb y energía')
  await expect(page.locator('.home-today')).toContainText('conceptos por reforzar')
  await expect(page.locator('.hero-card')).toHaveCount(0)
  expect(mock.requests.filter(item => ['material_chunks', 'study_artifacts', 'saved_solutions'].includes(item.table) && item.method === 'GET')).toHaveLength(0)
  expect(mock.requests.filter(item => item.table === 'materials' && item.method === 'GET').every(item => !new URL(item.url).searchParams.get('select')?.split(',').includes('content'))).toBe(true)
})

test('slow hydration preserves newer remote learning state before any autosave', async ({ page }) => {
  const mock = await academicMock(page)
  mock.seedCourse(course)
  const materialId = course.materials[0].id
  const key = `${materialId}:energia-cinetica`
  mock.rows.set('learning_state', new Map([[key, { user_id: user.id, course_id: course.id, material_id: materialId,
    concept_key: 'energia-cinetica', concept_label: 'Energía cinética', attempts: 7, correct_attempts: 6,
    confidence: .9, status: 'mastered', updated_at: '2026-09-30T15:00:00Z' }]]))
  await page.addInitScript(({ userId, key, materialId }) => {
    localStorage.setItem(`nexo-learning-v1:${userId}`, JSON.stringify({ [key]: { key, label: 'Energía cinética', materialId,
      attempts: 1, correctAttempts: 0, confidence: 0, status: 'learning', updatedAt: '2026-09-29T15:00:00Z' } }))
  }, { userId: user.id, key, materialId })
  let hydrated = false
  const prematureWrites: unknown[] = []
  await page.route('**/rest/v1/learning_state?*', async route => {
    if (route.request().method() === 'GET') {
      await new Promise(resolve => setTimeout(resolve, 1300))
      hydrated = true
    } else if (!hydrated) prematureWrites.push(route.request().postDataJSON())
    await route.fallback()
  })
  await login(page)
  await expect.poll(() => mock.requests.some(item => item.table === 'learning_state' && item.method === 'POST')).toBe(true)
  expect(prematureWrites).toEqual([])
  expect(mock.rows.get('learning_state')!.get(key)!.attempts).toBe(7)
  await navigateSection(page, 'Progreso')
  await expect(page.locator('.stat-card').filter({ hasText: 'Dominio estimado' })).toContainText('90%')
})

test('a failed written review cannot create mastery; explicit self assessment updates every surface', async ({ page }) => {
  const mock = await academicMock(page)
  const materialId = course.materials[0].id
  const now = '2026-09-30T10:00:00Z'
  mock.seedCourse({ ...course, materials: [{ ...course.materials[0], artifacts: [{ id: 'written-fixture', sourceMaterialId: materialId,
    type: 'written_questions', version: 1, status: 'ready', createdAt: now, updatedAt: now,
    payload: { questions: [{ question: 'Explica la energía cinética.', keyPoints: ['Masa y velocidad'], concept: 'Energía cinética', sourcePage: 2 }] } }] }] })
  let fail = true
  await page.route('**/api/ai/solve', route => route.fulfill(fail ? { status: 503, json: { error: 'Servicio no disponible' } } : { json: { text: 'Revisa la relación entre masa y velocidad.' } }))
  await login(page)
  await page.goto(`/courses/${course.id}/materials/${materialId}/study/written`)
  await page.getByRole('textbox', { name: 'Tu respuesta' }).fill('Creo que solo depende del volumen.')
  await page.getByRole('button', { name: 'Revisar con Nexo' }).click()
  await expect(page.getByRole('alert')).toContainText('no pudo revisar')
  await expect(page.getByRole('button', { name: 'Necesito repasar' })).toHaveCount(0)
  expect(mock.requests.filter(item => item.table === 'learning_state' && item.method === 'POST')).toHaveLength(0)
  fail = false
  await page.getByRole('button', { name: 'Revisar con Nexo' }).click()
  await page.getByRole('button', { name: 'Necesito repasar' }).click()
  await navigateSection(page, 'Inicio')
  await expect(page.locator('.home-today')).toContainText('conceptos por reforzar')
  await navigateSection(page, 'Progreso')
  await expect(page.locator('.progress-focus')).toContainText('Energía cinética')
  await expect(page.locator('.progress-recent')).toContainText('1 preguntas respondidas')
})

test('mobile header, drawer, suggestions, accordions and search fit all target widths', async ({ page }, info) => {
  test.setTimeout(90000)
  const mock = await academicMock(page)
  mock.seedCourse(course)
  const visit = (path: string) => page.evaluate(target => { history.pushState({}, '', target); dispatchEvent(new PopStateEvent('popstate')) }, path)
  await login(page)
  for (const [width, height] of [[393, 852], [430, 932], [768, 1024], [1440, 900], [1920, 1080]]) {
    await page.setViewportSize({ width, height })
    await visit('/resolver')
    await expect(page.locator('.solver-composer')).toBeVisible()
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1)
    if (width >= 1101) {
      const layout = await page.locator('.solver-layout').boundingBox()
      const chat = await page.locator('.solver-chat').boundingBox()
      expect(chat!.width).toBeGreaterThanOrEqual(layout!.width * .95)
    }
    if (width < 700) {
      await expect(page.locator('.mobile-title')).toHaveText('Resolver')
      const composer = await page.locator('.solver-composer').boundingBox()
      await expect(page.getByRole('navigation', { name: 'Navegación móvil' })).toHaveCount(0)
      expect(composer!.y + composer!.height).toBeLessThanOrEqual(height)
      await page.getByRole('button', { name: 'Abrir navegación' }).click()
      const drawer = await page.locator('.sidebar').boundingBox()
      expect(drawer!.width).toBeLessThanOrEqual(320.5)
      expect(drawer!.width).toBeLessThan(width * .87)
      await expect(page.getByRole('navigation', { name: 'Navegación móvil' })).toBeHidden()
      await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('hidden')
      await page.locator('.mobile-sidebar-backdrop').click({ position: { x: width - 8, y: 100 } })
      await page.getByRole('button', { name: 'Abrir navegación' }).click()
      await page.keyboard.press('Escape')
      await expect(page.locator('.app-shell')).not.toHaveClass(/mobile-sidebar-open/)
    }
    await page.keyboard.press('Control+k')
    await expect(page.getByRole('dialog', { name: 'Buscar en Nexo Study' })).toBeVisible()
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1)
    await page.keyboard.press('Escape')
    await page.screenshot({ path: info.outputPath(`resolver-${width}.png`) })
    await visit(`/courses/${course.id}/materials/material-pages/workspace`)
    if (width < 700) {
      await expect(page.locator('.workspace-edge-trigger')).toBeHidden()
      await page.getByRole('tab', { name: 'Nexo IA' }).click()
    }
    for (const name of ['Resumen', 'Temas detectados', 'Aprender', 'Practicar', 'Evaluar']) {
      await page.locator('.material-content-section > summary').filter({ hasText: name }).click()
      expect(await page.locator('.material-content-section[open]').count()).toBeLessThanOrEqual(1)
    }
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1)
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
    await page.screenshot({ path: info.outputPath(`workspace-${width}.png`) })
    await visit(`/courses/${course.id}/library`)
    await expect(page.locator('.course-artifact-library')).toBeVisible()
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1)
  }
})
