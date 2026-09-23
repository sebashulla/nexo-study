import { expect, test, type Page } from '@playwright/test'

const user = { id: '12345678-1234-4234-8234-123456789012', aud: 'authenticated', role: 'authenticated', email: 'estudiante@example.com', user_metadata: { full_name: 'Estudiante Nexo' }, app_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: 'test-access-token', refresh_token: 'test-refresh-token', token_type: 'bearer', expires_in: 3600, user }

test.beforeEach(async ({ page }) => {
  await page.route('**/auth/v1/**', route => route.fulfill({ json: new URL(route.request().url()).pathname.endsWith('/user') ? user : session }))
  await page.route('**/rest/v1/**', route => route.fulfill({ json: [] }))
})

async function login(page: Page) {
  await page.goto('/')
  await page.getByLabel('Correo electrónico', { exact: true }).fill(user.email)
  await page.getByLabel('Contraseña', { exact: true }).fill('UnaClave123!')
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page.getByRole('button', { name: 'Mi cuenta' })).toBeVisible()
}

test('Corrector sends the selected work type and renders the review', async ({ page }) => {
  let payload: Record<string, unknown> | undefined
  await page.route('**/api/ai/solve', route => {
    payload = route.request().postDataJSON()
    return route.fulfill({ json: { text: 'La estructura es clara. Añade una fuente para la conclusión.' } })
  })
  await login(page)
  await page.goto('/corrector')
  await page.getByLabel('Tipo de trabajo').selectOption('Ensayo')
  await page.getByRole('textbox', { name: 'Texto del trabajo' }).fill('Mi ensayo tiene una conclusión que necesita evidencia.')
  await page.getByRole('button', { name: 'Revisar con Nexo' }).click()
  await expect(page.locator('.review-answer')).toContainText('Añade una fuente')
  expect(payload).toMatchObject({ task: 'review', category: 'Ensayo', deep: false, question: 'Mi ensayo tiene una conclusión que necesita evidencia.' })
})

test('Resolver preserves reinforced reasoning in the request', async ({ page }) => {
  let payload: Record<string, unknown> | undefined
  await page.route('**/api/ai/solve', route => {
    payload = route.request().postDataJSON()
    return route.fulfill({ json: { text: 'Primero identificamos los datos; luego verificamos el resultado.' } })
  })
  await login(page)
  await page.goto('/resolver')
  await page.locator('.deep-toggle').click()
  await expect(page.getByRole('checkbox', { name: 'Razonamiento reforzado' })).toBeChecked()
  await page.getByRole('textbox', { name: 'Escribe tu pregunta' }).fill('Explica este procedimiento')
  await page.getByRole('button', { name: 'Enviar pregunta' }).click()
  await expect(page.locator('.solver-assistant-bubble')).toContainText('verificamos el resultado')
  expect(payload).toMatchObject({ task: 'solve', deep: true, question: 'Explica este procedimiento' })
})

test('Resolver sends multiple image attachments together', async ({ page }) => {
  let payload: { images?: unknown[] } | undefined
  await page.route('**/api/ai/solve', route => {
    payload = route.request().postDataJSON()
    return route.fulfill({ json: { text: 'Ambas imágenes contienen información para comparar.' } })
  })
  await login(page)
  await page.goto('/resolver')
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB3sAAAAASUVORK5CYII=', 'base64')
  await page.locator('.solver-composer input[type="file"]').setInputFiles([
    { name: 'pagina-1.png', mimeType: 'image/png', buffer: png },
    { name: 'pagina-2.png', mimeType: 'image/png', buffer: png },
  ])
  await expect(page.locator('.solver-attachments img')).toHaveCount(2)
  await page.getByRole('textbox', { name: 'Escribe tu pregunta' }).fill('Compara las dos imágenes')
  await page.getByRole('button', { name: 'Enviar pregunta' }).click()
  await expect(page.locator('.solver-assistant-bubble')).toContainText('Ambas imágenes')
  expect(payload?.images).toHaveLength(2)
})

test('a PDF can be imported and prepared as study material', async ({ page }) => {
  await page.addInitScript(() => {
    Object.assign(window, { pdfjsLib: {
      GlobalWorkerOptions: { workerSrc: '' },
      getDocument: () => ({ promise: Promise.resolve({
        numPages: 2,
        getPage: async (number: number) => ({ getTextContent: async () => ({ items: [{ str: number === 1 ? 'La célula contiene un núcleo.' : 'La membrana regula el paso de sustancias.' }] }) }),
      }) }),
    } })
  })
  const pack = {
    summary: ['La célula contiene un núcleo.', 'La membrana regula sustancias.', 'Ambas estructuras cumplen funciones distintas.'],
    keywords: ['célula', 'núcleo', 'membrana'],
    flashcards: Array.from({ length: 6 }, (_, i) => ({ front: `Pregunta ${i + 1}`, back: 'Respuesta basada en el PDF.', sourcePage: 1 })),
    quiz: Array.from({ length: 5 }, (_, i) => ({ question: `Pregunta ${i + 1}`, options: ['A', 'B', 'C', 'D'], answer: 0, explanation: 'Está respaldado por el PDF.', sourcePage: 2 })),
  }
  await page.route('**/api/ai/solve', route => route.fulfill({ json: { text: JSON.stringify(pack) } }))
  await login(page)
  await page.goto('/courses')
  await page.getByRole('button', { name: /Nuevo curso/ }).first().click()
  let dialog = page.getByRole('dialog')
  await dialog.getByLabel('Nombre del curso').fill('Biología PDF')
  await dialog.getByRole('button', { name: 'Crear curso' }).click()
  await page.getByRole('button', { name: /Agregar material/ }).first().click()
  dialog = page.getByRole('dialog')
  await dialog.locator('input[type="file"]').setInputFiles({ name: 'celula.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\nmock') })
  await expect(dialog).toContainText('PDF procesado: 2 páginas')
  await dialog.getByRole('button', { name: 'Guardar y preparar con Nexo IA' }).click()
  await expect(page.getByRole('heading', { name: 'celula' }).first()).toBeVisible()
  await expect(page.locator('.ai-note')).toContainText('Preparado por Nexo IA')
})

test('feedback can be submitted from the compact modal', async ({ page }) => {
  let payload: Record<string, unknown> | undefined
  await page.route('**/rest/v1/feedback_entries', route => {
    if (route.request().method() !== 'POST') return route.fulfill({ json: [] })
    payload = route.request().postDataJSON()
    return route.fulfill({ status: 201, json: [] })
  })
  await login(page)
  await page.getByRole('button', { name: 'Enviar retroalimentación' }).click()
  const dialog = page.getByRole('dialog', { name: 'Ayúdanos a mejorar Nexo' })
  await dialog.getByRole('button', { name: 'Algo falló' }).click()
  await dialog.getByRole('button', { name: '4 estrellas' }).click()
  await dialog.getByRole('textbox', { name: 'Tu comentario' }).fill('El botón de práctica no respondió una vez.')
  await dialog.getByRole('button', { name: 'Enviar comentario' }).click()
  await expect(dialog.getByRole('heading', { name: '¡Gracias!' })).toBeVisible()
  expect(payload).toMatchObject({ feedback_type: 'bug', rating: 4, page_context: '/' })
})

test('admin feedback route keeps its authorization gate and status action', async ({ page }) => {
  await login(page)
  await page.goto('/nexo-ops/feedback-console')
  await expect(page.getByRole('heading', { name: 'Página no encontrada' })).toBeVisible()

  const feedback = { id: 'feedback-1', user_id: user.id, feedback_type: 'idea', rating: 5, message: 'Me gustaría practicar más.', page_context: '/progress', status: 'new', created_at: '2026-09-01T12:00:00Z' }
  let updatedStatus: string | undefined
  await page.route('**/rest/v1/**', route => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/profiles') && url.searchParams.get('select') === 'is_admin') return route.fulfill({ json: { is_admin: true } })
    if (url.pathname.endsWith('/profiles')) return route.fulfill({ json: [{ id: user.id, username: 'estudiante', full_name: 'Estudiante Nexo' }] })
    if (url.pathname.endsWith('/feedback_entries') && route.request().method() === 'PATCH') {
      updatedStatus = route.request().postDataJSON().status
      return route.fulfill({ json: [] })
    }
    if (url.pathname.endsWith('/feedback_entries')) return route.fulfill({ json: [feedback] })
    return route.fulfill({ json: [] })
  })
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Comentarios de Nexo' })).toBeVisible()
  await expect(page.locator('.admin-feedback-card')).toContainText('Me gustaría practicar más.')
  await page.locator('.admin-feedback-card select').selectOption('reviewing')
  await expect.poll(() => updatedStatus).toBe('reviewing')
})

test('main workspaces fit common desktop widths', async ({ page }) => {
  await login(page)
  for (const width of [1200, 1024]) {
    await page.setViewportSize({ width, height: 900 })
    for (const route of ['/', '/courses', '/resolver', '/corrector', '/progress']) {
      await page.goto(route)
      await expect(page.getByRole('button', { name: 'Mi cuenta' })).toBeVisible()
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
      expect(scrollWidth, `${route} at ${width}px`).toBeLessThanOrEqual(width + 1)
    }
  }
})
