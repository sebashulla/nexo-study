import { expect, test, type Page } from '@playwright/test'

const user = { id: '12345678-1234-4234-8234-123456789012', aud: 'authenticated', role: 'authenticated', email: 'estudiante@example.com', user_metadata: { full_name: 'Estudiante Nexo' }, app_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: 'test-access-token', refresh_token: 'test-refresh-token', token_type: 'bearer', expires_in: 3600, user }

test.beforeEach(async ({ page }) => {
  await page.route('**/auth/v1/**', route => {
    const url = new URL(route.request().url())
    return route.fulfill({ json: url.pathname.endsWith('/user') ? user : session })
  })
  await page.route('**/rest/v1/**', route => route.fulfill({ json: [] }))
})

async function login(page: Page) {
  await page.goto('/')
  await page.getByLabel('Correo electrónico', { exact: true }).fill(user.email)
  await page.getByLabel('Contraseña', { exact: true }).fill('UnaClave123!')
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page.getByRole('button', { name: 'Mi cuenta' })).toBeVisible()
  await page.goto('/resolver')
}

test('Resolver behaves as a conversation with thinking stages, follow-up context and saved chats', async ({ page }, info) => {
  const requests: Array<{ question: string; context?: string; category: string }> = []
  await page.route('**/api/ai/solve', async route => {
    const payload = route.request().postDataJSON()
    requests.push(payload)
    if (requests.length === 1) await new Promise(resolve => setTimeout(resolve, 2800))
    await route.fulfill({ json: { text: requests.length === 1 ? 'El resultado es 4.' : 'Porque dos más dos suman cuatro.' } })
  })
  await login(page)
  await expect(page.getByRole('heading', { name: 'Resolver con Nexo IA' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Nuevo chat' })).toHaveCount(0)
  const feedback = page.getByRole('button', { name: 'Enviar retroalimentación' })
  await expect(feedback).toHaveCount(1)
  await expect(feedback).toBeVisible()
  const feedbackBounds = await feedback.boundingBox()
  const sendBounds = await page.getByRole('button', { name: 'Enviar pregunta' }).boundingBox()
  expect(feedbackBounds && sendBounds && (
    feedbackBounds.x + feedbackBounds.width <= sendBounds.x ||
    sendBounds.x + sendBounds.width <= feedbackBounds.x ||
    feedbackBounds.y + feedbackBounds.height <= sendBounds.y ||
    sendBounds.y + sendBounds.height <= feedbackBounds.y
  )).toBeTruthy()
  if (page.viewportSize()!.width <= 700) await expect(page.getByRole('textbox', { name: 'Escribe tu pregunta' })).toBeInViewport()
  await page.screenshot({ path: info.outputPath('resolver-empty.png') })
  await page.getByRole('group', { name: 'Materia' }).getByRole('button', { name: 'Matemáticas' }).click()
  await page.getByRole('textbox', { name: 'Escribe tu pregunta' }).fill('¿Cuánto es 2 + 2?')
  await page.getByRole('button', { name: 'Enviar pregunta' }).click()
  await expect(page.locator('.solver-user-bubble')).toContainText('¿Cuánto es 2 + 2?')
  await expect(page.getByRole('button', { name: 'Nuevo chat' })).toBeVisible()
  await expect(page.getByRole('status')).toContainText('Pensando')
  await expect(page.getByRole('status')).toContainText('Calculando', { timeout: 5000 })
  await expect(page.locator('.solver-assistant-bubble')).toContainText('El resultado es 4.')
  await page.getByRole('textbox', { name: 'Escribe tu pregunta' }).fill('¿Por qué?')
  await page.getByRole('textbox', { name: 'Escribe tu pregunta' }).press('Enter')
  await expect(page.locator('.solver-assistant-bubble')).toHaveCount(2)
  expect(requests).toHaveLength(2)
  expect(requests[1].context).toContain('¿Cuánto es 2 + 2?')
  expect(requests[1].context).toContain('El resultado es 4.')
  await expect(page.getByRole('textbox', { name: 'Escribe tu pregunta' })).toBeFocused()
  await page.waitForTimeout(350)
  if (page.viewportSize()!.width <= 700) await expect(page.getByRole('textbox', { name: 'Escribe tu pregunta' })).toBeInViewport()
  await page.screenshot({ path: info.outputPath('resolver-conversation.png') })
  await page.reload()
  await expect(page.locator('.solver-assistant-bubble')).toHaveCount(2)
  await page.getByRole('button', { name: 'Nuevo chat' }).click()
  await expect(page.getByRole('heading', { name: '¿Por dónde empezamos?' })).toBeVisible()
  if (page.viewportSize()!.width <= 700) await page.getByRole('button', { name: 'Mostrar conversaciones' }).click()
  await page.getByRole('button', { name: /¿Cuánto es 2 \+ 2\?/ }).click()
  await expect(page.locator('.solver-assistant-bubble')).toHaveCount(2)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy()
})

test('Quiz offers one practice mode with all questions and a restart action', async ({ page }) => {
  await login(page)
  await page.goto('/courses/course-bio/materials/mat-cell')
  await expect(page.getByRole('button', { name: 'Simulacro' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Quiz', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Quiz del material' })).toBeVisible()
  const count = await page.locator('.quiz-card').count()
  expect(count).toBeGreaterThan(0)
  await page.locator('.quiz-card .options button').first().click()
  await expect(page.getByRole('button', { name: 'Practicar de nuevo' })).toBeVisible()
  await page.getByRole('button', { name: 'Practicar de nuevo' }).click()
  await expect(page.locator('.quiz-card .options button').first()).toBeEnabled()
})

test('an image question can recover from an AI error without duplicating the user message', async ({ page }) => {
  let attempts = 0
  await page.route('**/api/ai/solve', route => {
    attempts += 1
    expect(route.request().postDataJSON().images).toHaveLength(1)
    return route.fulfill(attempts === 1
      ? { status: 503, json: { error: 'Servicio temporalmente no disponible' } }
      : { json: { text: 'La imagen muestra el ejercicio.' } })
  })
  await login(page)
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB3sAAAAASUVORK5CYII=', 'base64')
  await page.locator('.solver-composer input[type="file"]').setInputFiles({ name: 'ejercicio.png', mimeType: 'image/png', buffer: png })
  await expect(page.locator('.solver-attachments img')).toBeVisible()
  await page.getByRole('textbox', { name: 'Escribe tu pregunta' }).fill('¿Qué muestra este ejercicio?')
  await page.getByRole('button', { name: 'Enviar pregunta' }).click()
  await expect(page.getByRole('alert')).toContainText('Servicio temporalmente no disponible')
  await expect(page.locator('.solver-user-bubble')).toHaveCount(1)
  await page.getByRole('button', { name: 'Reintentar' }).click()
  await expect(page.locator('.solver-assistant-bubble')).toContainText('La imagen muestra el ejercicio.')
  await expect(page.locator('.solver-user-bubble')).toHaveCount(1)
  expect(attempts).toBe(2)
})
