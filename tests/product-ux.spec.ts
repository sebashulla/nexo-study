import { expect, test, type Page } from '@playwright/test'

const user = { id: '12345678-1234-4234-8234-123456789012', aud: 'authenticated', role: 'authenticated', email: 'product@example.com',
  user_metadata: { full_name: 'Sebastián' }, app_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: 'test-access-token', refresh_token: 'test-refresh-token', token_type: 'bearer', expires_in: 3600, user }

test.beforeEach(async ({ page }) => {
  await page.route('**/auth/v1/**', route => route.fulfill({ json: new URL(route.request().url()).pathname.endsWith('/user') ? user : session }))
  await page.route('**/rest/v1/**', route => route.fulfill({ json: [] }))
  await page.route('**/storage/v1/**', route => route.fulfill({ status: 400, json: { error: 'mock storage' } }))
})

async function signIn(page: Page) {
  await page.goto('/')
  await page.getByLabel('Correo electrónico', { exact: true }).fill(user.email)
  await page.getByLabel('Contraseña', { exact: true }).fill('UnaClave123!')
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page.getByRole('button', { name: 'Mi cuenta' })).toBeVisible()
}

test('Home upload asks for a course and confirms an editable title before saving', async ({ page }) => {
  await signIn(page)
  await page.getByRole('button', { name: /Subir material/ }).first().click()
  let dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('¿Dónde quieres guardarlo?')
  await dialog.getByRole('button', { name: /Crear nuevo curso/ }).click()
  dialog = page.getByRole('dialog')
  await dialog.getByLabel('Nombre del curso').fill('Química')
  await dialog.getByRole('button', { name: 'Crear curso' }).click()
  dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Material para Química')
  await dialog.locator('input[type="file"]').setInputFiles({ name: '04435117-62-4-e6056_ES.txt', mimeType: 'text/plain',
    buffer: Buffer.from('La química estudia las propiedades y transformaciones de la materia en diferentes condiciones.') })
  await expect(dialog.getByLabel('Título para mostrar')).toHaveValue('Documento de estudio')
  await dialog.getByLabel('Título para mostrar').fill('Fundamentos de química')
  await dialog.getByRole('button', { name: 'Guardar y abrir material' }).click()
  await expect(page).toHaveURL(/\/courses\/[^/]+\/materials\/[^/]+\/workspace$/)
  const coursePath = new URL(page.url()).pathname.split('/').slice(0, 3).join('/')
  await expect(page.locator('.material-workspace-head')).toContainText('Fundamentos de química')
  await expect(page.locator('.material-workspace-head')).toContainText('04435117-62-4-e6056_ES.txt')
  await page.goto('/')
  await expect(page.locator('.home-today')).toContainText('Fundamentos de química')
  await page.goto(coursePath)
  await expect(page.getByRole('heading', { name: 'Nexo recomienda' })).toBeVisible()
})

test('course upload keeps the current course and mobile content opens one section at a time', async ({ page }) => {
  await signIn(page)
  await page.goto('/courses')
  await page.getByRole('button', { name: /Nuevo curso/ }).first().click()
  let dialog = page.getByRole('dialog')
  await dialog.getByLabel('Nombre del curso').fill('Anatomía')
  await dialog.getByRole('button', { name: 'Crear curso' }).click()
  await page.getByRole('button', { name: /Agregar material/ }).first().click()
  dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Material para Anatomía')
  await expect(dialog).not.toContainText('¿Dónde quieres guardarlo?')
  await dialog.getByRole('button', { name: 'Escribir apuntes sin archivo' }).click()
  await dialog.getByLabel('Título para mostrar').fill('Sistema circulatorio')
  await dialog.getByRole('textbox', { name: 'Apuntes' }).fill('El corazón impulsa la sangre por las arterias y las venas. La circulación transporta oxígeno y nutrientes a los tejidos.')
  await dialog.getByRole('button', { name: 'Guardar y abrir material' }).click()
  await page.setViewportSize({ width: 393, height: 852 })
  await page.getByRole('tab', { name: 'Nexo IA' }).click()
  const sections = page.locator('.material-content-section')
  await expect(sections.filter({ has: page.locator('summary', { hasText: 'Practicar' }) })).toHaveAttribute('open', '')
  await sections.locator('summary').filter({ hasText: 'Temas detectados' }).click()
  await expect(sections.filter({ has: page.locator('summary', { hasText: 'Temas detectados' }) })).toHaveAttribute('open', '')
  await expect(sections.filter({ has: page.locator('summary', { hasText: 'Practicar' }) })).not.toHaveAttribute('open', '')
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(394)
})

test('global search opens a topic in its material and page', async ({ page }) => {
  await signIn(page)
  await page.evaluate(id => localStorage.setItem(`nexo-study-courses-v5:${id}`, JSON.stringify([{
    id: 'course-search', name: 'Patología', emoji: '🩺', materials: [{
      id: 'mat-search', title: 'Clase 03', text: 'La necrosis celular es una forma de muerte celular.', sourceType: 'pdf',
      sourceName: 'clase03.pdf', pageCount: 8, analysisStatus: 'ready', processingStatus: 'ready', createdAt: '2026-01-01T00:00:00Z',
      topics: [{ id: crypto.randomUUID(), materialId: 'mat-search', title: 'Necrosis celular', summary: 'Muerte celular y cambios en el tejido.', pageStart: 3, pageEnd: 3, keywords: ['necrosis'] }],
    }],
  }])), user.id)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Buscar en Nexo Study' })).toBeVisible()
  await page.keyboard.press('Control+k')
  const dialog = page.getByRole('dialog', { name: 'Buscar en Nexo Study' })
  await dialog.getByRole('textbox', { name: 'Buscar en Nexo Study' }).fill('necrosis')
  await dialog.locator('.global-search-results button').filter({ hasText: 'Necrosis celular' }).last().click()
  await expect(page).toHaveURL(/\/courses\/course-search\/materials\/mat-search\/workspace$/)
  await expect(page.locator('.material-workspace-head')).toContainText('Página 3')
})

test('empty progress explains activity and mastery without 0/0 metrics', async ({ page }) => {
  await signIn(page)
  await page.goto('/progress')
  await expect(page.locator('.progress-empty').first()).toContainText('Aún no hay suficiente actividad')
  await expect(page.locator('.progress-page')).not.toContainText('0/0')
})
