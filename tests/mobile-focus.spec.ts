import { expect, test, type Page } from '@playwright/test'
import { academicMock, login } from './helpers/academicMock'
import type { Course } from '../src/types'

const topicText = [
  'El núcleo almacena ADN en cromosomas y dirige la actividad celular.',
  'La membrana selecciona sustancias mediante canales y transportadores.',
  'Las mitocondrias transforman nutrientes durante la respiración aeróbica.',
  'Los ribosomas sintetizan proteínas siguiendo instrucciones del ARN.',
  'Los lisosomas digieren residuos gracias a sus enzimas hidrolíticas.',
  'El citoplasma suspende orgánulos en un medio acuoso llamado citosol.',
  'El retículo distribuye lípidos hacia compartimentos especializados.',
  'El aparato de Golgi modifica productos para su secreción posterior.',
  'Los cloroplastos capturan luz durante el proceso de fotosíntesis.',
  'El citoesqueleto sostiene estructuras mediante filamentos resistentes.',
]

const course: Course = { id: 'focus-course', name: 'Biología', emoji: '🧬', materials: [{
  id: 'focus-material', title: 'Introducción a la célula', sourceType: 'pdf', pageCount: 4,
  text: 'La célula es la unidad básica de la vida. El núcleo contiene ADN y dirige la actividad celular.',
  pages: [{ page: 1, text: 'El núcleo contiene ADN.' }], createdAt: '2026-10-01T12:00:00Z',
  analysisStatus: 'ready', analyzedPages: [1, 2, 3, 4],
  chunks: topicText.map((text, index) => ({ id: `focus-chunk-${index}`, materialId: 'focus-material', text, pageStart: Math.min(4, Math.floor(index / 3) + 1), pageEnd: Math.min(4, Math.floor(index / 3) + 1), keywords: [] })),
  topics: topicText.map((text, index) => ({ id: `focus-topic-${index}`, materialId: 'focus-material', title: text, summary: text, pageStart: Math.min(4, Math.floor(index / 3) + 1), pageEnd: Math.min(4, Math.floor(index / 3) + 1), keywords: [] })),
  artifacts: [
    { id: 'focus-cards', sourceMaterialId: 'focus-material', type: 'flashcards', status: 'ready', version: 1, createdAt: '2026-10-01', updatedAt: '2026-10-01', payload: { cards: Array.from({ length: 3 }, (_, index) => ({ front: `¿Qué contiene el núcleo? ${index + 1}`, back: 'El núcleo contiene ADN y dirige la actividad de la célula.', concept: 'Núcleo celular', sourcePage: 1 })) } },
    { id: 'focus-quiz', sourceMaterialId: 'focus-material', type: 'multiple_choice', status: 'ready', version: 1, createdAt: '2026-10-01', updatedAt: '2026-10-01', payload: { questions: Array.from({ length: 3 }, (_, index) => ({ question: `¿Dónde se encuentra el ADN? ${index + 1}`, options: ['Núcleo', 'Membrana', 'Citoplasma', 'Ribosoma'], correctOption: 0, explanation: 'El núcleo contiene el ADN, según la página 1.', concept: 'Núcleo celular', sourcePage: 1 })) } },
    { id: 'focus-written', sourceMaterialId: 'focus-material', type: 'written_questions', status: 'ready', version: 1, createdAt: '2026-10-01', updatedAt: '2026-10-01', payload: { questions: [{ question: 'Explica la función del núcleo.', keyPoints: ['ADN'], concept: 'Núcleo celular', sourcePage: 1 }] } },
  ],
}] }
function seedFocusCourse(mock: Awaited<ReturnType<typeof academicMock>>) {
  mock.seedCourse(course)
  // The shared helper does not seed material_topics. Persist the fixture's
  // topics as the real repository does, rather than losing them on hydration.
  mock.rows.set('material_topics', new Map(course.materials[0].topics!.map(topic => [topic.id, {
    id: topic.id, user_id: '12345678-1234-4234-8234-123456789012', course_id: course.id, material_id: topic.materialId,
    title: topic.title, summary: topic.summary, page_start: topic.pageStart, page_end: topic.pageEnd, keywords: topic.keywords,
  }])))
}
const base = '/courses/focus-course/materials/focus-material'
const visit = async (page: Page, path: string) => page.evaluate(target => { history.pushState({}, '', target); dispatchEvent(new PopStateEvent('popstate')) }, path)
const overflow = async (page: Page) => expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width)

for (const [width, height] of [[320, 640], [360, 800], [375, 667], [390, 844], [393, 852], [430, 932], [768, 1024], [1366, 768], [1440, 900], [1920, 1080]]) {
  test(`critical surfaces and branding fit ${width}x${height}`, async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'The viewport matrix runs once; interaction tests below run on every browser project.')
    await page.setViewportSize({ width, height })
    const mock = await academicMock(page); seedFocusCourse(mock)
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
    await login(page)
    const shot = async (name: string) => {
      await overflow(page)
      if (!await page.locator('.study-focus-shell').count()) {
        await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }))
        await expect.poll(() => page.evaluate(() => scrollY)).toBe(0)
        await expect(page.getByRole('button', { name: 'Mi cuenta' })).toBeInViewport()
      }
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
      await page.screenshot({ path: info.outputPath(`${name}-${width}.png`), animations: 'disabled', fullPage: false })
    }
    await shot('home')
    if (width <= 700) {
      await expect(page.locator('.global-search-trigger')).toBeHidden()
      const header = (await page.locator('.topbar').boundingBox())!; expect(header.height).toBeGreaterThanOrEqual(56); expect(header.height).toBeLessThanOrEqual(64)
      await page.getByRole('button', { name: 'Abrir navegación' }).click()
      await expect(page.locator('.sidebar .brand img')).toHaveCount(1)
      await expect(page.locator('.sidebar .brand img')).toHaveAttribute('src', '/brand/logo-nexo.png')
      await shot('drawer'); await page.keyboard.press('Escape')
      await expect(page.getByRole('button', { name: 'Abrir navegación' })).toBeFocused()
    } else if (width > 950) {
      await expect(page.locator('.sidebar .brand img')).toHaveAttribute('src', '/brand/logo-nexo.png'); await shot('sidebar-expanded')
      await page.getByRole('button', { name: 'Colapsar barra lateral' }).click()
      await expect(page.locator('.sidebar .brand img')).toHaveCount(1); await expect(page.locator('.sidebar .brand img')).toHaveAttribute('src', '/brand/icon-nexo.png')
      await expect(page.locator('.sidebar-beta')).toHaveCount(0); await shot('sidebar-collapsed')
      await page.getByRole('button', { name: 'Expandir barra lateral' }).click()
    }
    for (const [path, selector, name] of [['/courses', '.course-library-grid', 'courses'], ['/courses/focus-course', '.course-page', 'course'], [base + '/workspace', '.material-workspace', 'material'], ['/resolver', '.solver-composer', 'resolver'], ['/corrector', '.review-text', 'corrector'], ['/progress', '.progress-page', 'progress']] as const) {
      await visit(page, path); await expect(page.locator(selector)).toBeVisible(); await shot(name)
      if (name === 'material') {
        if (width <= 700) {
          await expect(page.locator('.route-breadcrumbs')).toHaveCount(0)
          await page.getByRole('tab', { name: 'Nexo IA' }).click(); await expect(page.locator('.material-document')).toBeHidden()
          await shot('nexo')
          await page.locator('.material-content-section > summary').filter({ hasText: 'Temas detectados' }).click()
          await expect(page.locator('.material-topic')).toHaveCount(10)
          await page.locator('.material-topic > summary').first().click()
          await page.evaluate(() => scrollTo(0, 500))
          await expect.poll(async () => (await page.locator('.material-mobile-tabs').boundingBox())!.y).toBeLessThanOrEqual(65)
          const tabs = (await page.locator('.material-mobile-tabs').boundingBox())!; expect(tabs.y).toBeGreaterThanOrEqual(63); expect(tabs.y).toBeLessThanOrEqual(65)
          await page.getByRole('tab', { name: 'Material', exact: true }).click(); await expect(page.locator('.material-nexo-panel')).toBeHidden()
        } else {
          for (const split of ['70/30', '60/40', '50/50']) { await page.locator('.material-layout-menu summary').click(); await page.getByRole('button', { name: split, exact: true }).click(); await expect(page.getByRole('separator')).toHaveAttribute('aria-valuenow', split.split('/')[1]) }
          await page.getByRole('button', { name: 'Ocultar Nexo' }).click(); await expect(page.locator('.material-nexo-panel')).toHaveCount(0)
          await page.getByRole('button', { name: 'Abrir Nexo' }).click(); await expect(page.locator('.material-nexo-panel')).toBeVisible()
        }
      }
    }
    await visit(page, base + '/study/flashcards'); await expect(page.locator('.flashcard')).toBeVisible(); await shot('flashcards-front')
    if (width <= 700) { await expect(page.locator('.study-focus-shell')).toBeVisible(); await expect(page.locator('.topbar')).toHaveAttribute('inert', '') }
    await page.locator('.flashcard').focus(); await page.keyboard.press('Enter'); await expect(page.locator('.flashcard')).toContainText('RESPUESTA'); await shot('flashcards-back')
    if (width <= 700) for (const rating of await page.locator('.flash-rating button').all()) { const rect = (await rating.boundingBox())!; expect(rect.height).toBeGreaterThanOrEqual(44) }
    await page.getByRole('button', { name: 'Bien', exact: true }).click()
    await visit(page, base + '/study/multiple-choice'); await expect(page.locator('.quiz-card').first()).toBeVisible(); if (width <= 700) await expect(page.locator('.study-focus-counter')).toHaveText('1 / 3'); await shot('quiz')
    await expect(page.locator('.quiz-card')).toHaveCount(width <= 700 ? 1 : 3)
    await visit(page, '/'); await expect(page.locator('.home-continue')).toBeVisible(); await shot('home-active')
    expect(errors).toEqual([])
  })
}

test('phone quiz reaches every question, updates learning and returns focus to material', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 })
  const mock = await academicMock(page); seedFocusCourse(mock); await login(page)
  await visit(page, base + '/study/multiple-choice')
  for (let index = 0; index < 3; index++) {
    await expect(page.locator('.study-focus-counter')).toHaveText(`${index + 1} / 3`)
    await expect(page.locator('.quiz-card')).toHaveCount(1)
    await page.locator('.options button').nth(index === 0 ? 1 : 0).click()
    await expect(page.locator('.feedback')).toContainText(index === 0 ? 'Revisa esta idea' : 'Correcto')
    await expect(page.locator('.feedback')).toContainText('Fuente: página 1')
    await page.getByRole('button', { name: index === 2 ? 'Ver resultado' : 'Continuar →' }).click()
  }
  await expect(page.getByRole('heading', { name: 'Práctica terminada' })).toBeVisible()
  await expect.poll(() => mock.rows.get('concept_evidence')?.size).toBe(3)
  await expect.poll(() => [...(mock.rows.get('learning_state')?.values() ?? [])].reduce((total, state) => total + Number(state.attempts), 0)).toBe(3)
  await page.getByRole('button', { name: 'Practicar de nuevo' }).click(); await expect(page.locator('.study-focus-counter')).toHaveText('1 / 3')
  await page.getByRole('button', { name: 'Volver al material o curso' }).click()
  await expect(page.locator('.study-focus-shell')).toHaveCount(0); await expect(page.locator('.topbar')).not.toHaveAttribute('inert', '')
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden')
})

test('contextual sheet traps keyboard, closes with Escape and returns focus', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 })
  const mock = await academicMock(page); seedFocusCourse(mock); await login(page); await visit(page, '/courses')
  const trigger = page.getByRole('button', { name: 'Opciones de Biología' }).first()
  await trigger.click(); await expect(trigger).toHaveAttribute('aria-haspopup', 'dialog')
  const sheet = page.getByRole('dialog', { name: 'Acciones de Biología' }); await expect(sheet).toBeVisible()
  await expect(sheet.getByRole('menuitem', { name: 'Editar curso' })).toBeFocused()
  await page.keyboard.press('ArrowDown'); await expect(sheet.getByRole('menuitem', { name: 'Mover a espacio' })).toBeFocused()
  await page.keyboard.press('Escape'); await expect(sheet).toHaveCount(0); await expect(trigger).toBeFocused()
  await trigger.click(); await sheet.getByRole('menuitem', { name: 'Editar curso' }).click(); await expect(page.getByLabel('Nombre del curso')).toBeVisible()
})

test('logical visual viewport keeps Resolver, Corrector and written study actions above keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 })
  await page.addInitScript(() => {
    const viewport = Object.assign(new EventTarget(), { width: 393, height: 852, offsetTop: 0, offsetLeft: 0, pageTop: 0, pageLeft: 0, scale: 1 })
    Object.defineProperty(window, 'visualViewport', { value: viewport, configurable: true })
  })
  const mock = await academicMock(page); seedFocusCourse(mock); await login(page)
  const shrink = async () => page.evaluate(() => { Object.defineProperty(window.visualViewport!, 'height', { value: 430, configurable: true }); window.visualViewport!.dispatchEvent(new Event('resize')) })
  for (const [path, input, button] of [['/resolver', 'Escribe tu pregunta', 'Enviar pregunta'], ['/corrector', 'Texto del trabajo', 'Revisar con Nexo'], [base + '/study/written', 'Tu respuesta', 'Revisar con Nexo']] as const) {
    await visit(page, path); await page.getByRole('textbox', { name: input }).fill('El núcleo contiene ADN.'); await page.getByRole('textbox', { name: input }).focus(); await shrink()
    await expect(page.locator('html')).toHaveAttribute('data-keyboard-open', 'true')
    const rect = (await page.getByRole('button', { name: button }).boundingBox())!; expect(rect.y + rect.height).toBeLessThanOrEqual(431)
    await expect(page.getByRole('textbox', { name: input })).toHaveCSS('font-size', '16px')
    await overflow(page)
  }
})

test('responsive focus preserves an unfinished written answer and quiz position', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 })
  const mock = await academicMock(page); seedFocusCourse(mock); await login(page)
  await visit(page, base + '/study/written')
  const editor = page.getByRole('textbox', { name: 'Tu respuesta' })
  const initialHeight = (await editor.boundingBox())!.height
  await editor.fill(Array.from({ length: 12 }, () => 'Esta explicación ocupa varias líneas.').join('\n'))
  await expect.poll(async () => (await editor.boundingBox())!.height).toBeGreaterThan(initialHeight)
  expect((await editor.boundingBox())!.height).toBeLessThanOrEqual(280)
  await page.getByRole('textbox', { name: 'Tu respuesta' }).fill('El núcleo contiene ADN; aún estoy redactando.')
  for (const width of [768, 393]) {
    await page.setViewportSize({ width, height: 852 })
    await expect(page.getByRole('textbox', { name: 'Tu respuesta' })).toHaveValue('El núcleo contiene ADN; aún estoy redactando.')
  }
  await visit(page, base + '/study/multiple-choice')
  await page.locator('.options button').first().click(); await page.getByRole('button', { name: 'Continuar →' }).click()
  for (const width of [768, 393]) await page.setViewportSize({ width, height: 852 })
  await expect(page.locator('.study-focus-counter')).toHaveText('2 / 3')
  await expect(page.locator('.quiz-card')).toContainText('¿Dónde se encuentra el ADN? 2')
})
