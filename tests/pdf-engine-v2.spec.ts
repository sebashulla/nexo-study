import { expect, test, type Page } from '@playwright/test'

const user = { id: '12345678-1234-4234-8234-123456789012', aud: 'authenticated', role: 'authenticated', email: 'pdf@example.com', user_metadata: { full_name: 'Estudiante PDF' }, app_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: 'test-access-token', refresh_token: 'test-refresh-token', token_type: 'bearer', expires_in: 3600, user }

test.beforeEach(async ({ page }) => {
  await page.route('**/auth/v1/**', route => route.fulfill({ json: new URL(route.request().url()).pathname.endsWith('/user') ? user : session }))
  await page.route('**/rest/v1/**', route => route.fulfill({ json: [] }))
  await page.route('**/storage/v1/**', route => route.fulfill({ status: 400, json: { error: 'mock storage' } }))
})

async function uploadMockPdf(page: Page, kind: 'text' | 'scan' | 'mixed' | 'fail', pageCount: number) {
  await page.addInitScript(({ scenario, count }) => {
    const state = window as Window & { __pdfTestScenario: string }
    state.__pdfTestScenario = scenario
    Object.defineProperty(window, 'pdfjsLib', { configurable: true, value: {
      GlobalWorkerOptions: { workerSrc: '' },
      getDocument: () => ({ promise: Promise.resolve({
        numPages: count,
        getMetadata: async () => ({ info: { Title: 'Documento de prueba' } }),
        getPage: async (pageNumber: number) => {
          if (state.__pdfTestScenario === 'fail') throw new Error('Mock extraction failure')
          return {
            getTextContent: async () => ({ items: state.__pdfTestScenario === 'scan' ||
              (state.__pdfTestScenario === 'mixed' && pageNumber % 2 === 0)
              ? [] : [{ str: `Concepto de la página ${pageNumber}` }] }),
            getViewport: () => ({ width: 600, height: 800 }),
            render: ({ canvasContext }: { canvasContext: CanvasRenderingContext2D }) => {
              canvasContext.fillText(`Página ${pageNumber}`, 20, 20)
              return { promise: Promise.resolve() }
            },
          }
        },
        destroy: async () => {},
      }) }),
    } })
  }, { scenario: kind, count: pageCount })
  await page.goto('/')
  await page.getByLabel('Correo electrónico', { exact: true }).fill(user.email)
  await page.getByLabel('Contraseña', { exact: true }).fill('UnaClave123!')
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page.getByRole('button', { name: 'Mi cuenta' })).toBeVisible()
  await page.goto('/courses')
  await page.getByRole('button', { name: /Nuevo curso/ }).first().click()
  let dialog = page.getByRole('dialog')
  await dialog.getByLabel('Nombre del curso').fill(`PDF ${kind}`)
  await dialog.getByRole('button', { name: 'Crear curso' }).click()
  await page.getByRole('button', { name: /Agregar material/ }).first().click()
  dialog = page.getByRole('dialog')
  await dialog.locator('input[type="file"]').setInputFiles({ name: 'Irodov-Problems_in_General_Physics.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF') })
  await expect(page).toHaveURL(/\/workspace$/)
}

test('a 402 page PDF opens immediately and analyzes a bounded first pass', async ({ page }) => {
  await uploadMockPdf(page, 'text', 402)
  await expect(page.locator('.material-workspace-head')).toContainText('402 páginas')
  await expect(page.locator('.material-workspace-head h2')).toHaveText('Irodov — Problems in General Physics')
  await expect(page.locator('.material-document iframe')).toBeVisible()
  await expect(page.locator('.material-processing')).toContainText('80 de 402 páginas')
  await page.getByRole('button', { name: 'Analizar más páginas' }).click()
  await expect(page.locator('.material-processing')).toContainText('160 de 402 páginas')
})

test('a scanned PDF remains viewable and permits a selected visual page', async ({ page }) => {
  let images = 0
  await page.route('**/api/ai/solve', route => {
    images = route.request().postDataJSON().images?.length ?? 0
    return route.fulfill({ json: { text: 'La página muestra una introducción a la célula.' } })
  })
  await uploadMockPdf(page, 'scan', 3)
  await expect(page.locator('.material-workspace-head')).toContainText('3 páginas')
  await expect(page.locator('.material-processing')).toContainText('Este documento parece estar escaneado')
  await expect(page.locator('.material-document iframe')).toBeVisible()
  if (page.viewportSize()!.width <= 700) await page.getByRole('tab', { name: 'Nexo IA' }).click()
  await expect(page.locator('.material-nexo-content')).toContainText('Analiza algunas páginas')
  await page.locator('.material-visual-analysis').getByRole('button', { name: 'Analizar visualmente' }).click()
  await expect(page.locator('.material-chat-answer')).toContainText('introducción a la célula')
  expect(images).toBe(1)
  await page.locator('.material-nexo-head').getByRole('button', { name: 'Contenido' }).click()
  await expect(page.getByRole('button', { name: /Flashcards/ }).last()).toBeEnabled()
})

test('mixed PDF keeps partial analysis and usable methods', async ({ page }) => {
  await uploadMockPdf(page, 'mixed', 4)
  await expect(page.locator('.material-processing')).toContainText('4 de 4 páginas')
  if (page.viewportSize()!.width <= 700) await page.getByRole('tab', { name: 'Nexo IA' }).click()
  await expect(page.getByRole('button', { name: /Flashcards/ }).last()).toBeEnabled()
  await expect(page.locator('.material-visual-analysis')).toBeVisible()
})

test('failed text extraction preserves physical page count and can retry', async ({ page }) => {
  await uploadMockPdf(page, 'fail', 4)
  await expect(page.locator('.material-workspace-head')).toContainText('4 páginas')
  await expect(page.locator('.material-processing')).toContainText('No pudimos preparar el análisis')
  await page.evaluate(() => { (window as Window & { __pdfTestScenario: string }).__pdfTestScenario = 'text' })
  await page.getByRole('button', { name: 'Reintentar lectura' }).click()
  await expect(page.locator('.material-workspace-head')).toContainText('Nexo listo')
})

test('workspace, mobile tabs and navigation fit target viewport sizes', async ({ page }) => {
  await uploadMockPdf(page, 'text', 1)
  await expect(page.locator('.material-workspace-head')).toContainText('1 página')
  for (const [width, height] of [[393, 852], [430, 932], [768, 1024], [1440, 900]]) {
    await page.setViewportSize({ width, height })
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1)
    if (width <= 430) {
      await expect(page.getByRole('tab', { name: 'Material' })).toBeVisible()
      await page.getByRole('tab', { name: 'Nexo IA' }).click()
      await expect(page.locator('.material-nexo-panel')).toBeVisible()
      await expect(page.locator('.material-document')).toBeHidden()
      await page.getByRole('tab', { name: 'Material' }).click()
      await expect(page.locator('.material-document')).toBeVisible()
    }
  }
  await page.setViewportSize({ width: 393, height: 852 })
  await page.getByRole('button', { name: 'Abrir navegación' }).click()
  await expect(page.locator('.app-shell')).toHaveClass(/mobile-sidebar-open/)
  await expect(page.getByRole('navigation', { name: 'Navegación móvil' })).toBeHidden()
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('hidden')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('navigation', { name: 'Navegación móvil' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe('hidden')
  await page.getByRole('button', { name: /Cambiar espacio de estudio/ }).click()
  await expect(page.getByRole('navigation', { name: 'Navegación móvil' })).toBeHidden()
  await page.getByRole('button', { name: 'Cerrar explorador de espacios' }).last().click()
  await expect(page.getByRole('navigation', { name: 'Navegación móvil' })).toBeVisible()
})
