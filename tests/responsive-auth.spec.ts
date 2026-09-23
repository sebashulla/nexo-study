import { test, expect, type Page } from '@playwright/test'

// Only simulated auth responses: never create accounts or send real emails.
const user = { id: '12345678-1234-4234-8234-123456789012', aud: 'authenticated', role: 'authenticated', email: 'estudiante@example.com', user_metadata: { full_name: 'Estudiante Nexo' }, app_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: 'test-access-token', refresh_token: 'test-refresh-token', token_type: 'bearer', expires_in: 3600, user }

test.beforeEach(async ({ page }) => {
  await page.route('**/auth/v1/**', async route => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/token')) {
      const body = route.request().postDataJSON()
      if (body.password === 'incorrecta') return route.fulfill({ status: 400, json: { code: 'invalid_credentials', msg: 'Invalid login credentials' } })
      return route.fulfill({ json: session })
    }
    if (url.pathname.endsWith('/user')) return route.fulfill({ json: user })
    if (url.pathname.endsWith('/signup')) return route.fulfill({ json: { ...user, identities: [{ id: user.id }] } })
    return route.fulfill({ json: {} })
  })
  await page.route('**/rest/v1/**', route => route.fulfill({ json: route.request().url().includes('is_username_available') ? true : [] }))
})

async function login(page: Page) {
  await page.goto('/')
  await page.getByLabel('Correo electrónico', { exact: true }).fill(user.email)
  await page.getByLabel('Contraseña', { exact: true }).fill('UnaClave123!')
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page.getByRole('button', { name: 'Mi cuenta', exact: true })).toBeVisible()
}

async function noOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, viewport: window.innerWidth }))
  expect(dimensions.scroll, `Horizontal overflow: ${JSON.stringify(dimensions)}`).toBeLessThanOrEqual(dimensions.viewport + 1)
}

test('login: validation, password visibility, error, session persistence and sign out', async ({ page }, info) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Qué bueno verte.' })).toBeVisible()
  await noOverflow(page)
  await page.screenshot({ path: info.outputPath('login.png'), fullPage: true })
  await page.getByLabel('Correo electrónico', { exact: true }).fill(user.email)
  await page.getByLabel('Contraseña', { exact: true }).fill('incorrecta')
  await page.getByRole('button', { name: 'Mostrar contraseña' }).click()
  await expect(page.getByLabel('Contraseña', { exact: true })).toHaveAttribute('type', 'text')
  await page.getByRole('button', { name: 'Ocultar contraseña' }).click()
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page.getByRole('alert')).toContainText('El correo o la contraseña no son correctos')
  await page.getByLabel('Contraseña', { exact: true }).fill('UnaClave123!')
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page.getByRole('button', { name: 'Mi cuenta' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Mi cuenta' })).toBeVisible()
  await page.getByRole('button', { name: 'Mi cuenta' }).click()
  await page.getByRole('button', { name: 'Cerrar sesión' }).click()
  await expect(page.getByRole('heading', { name: 'Qué bueno verte.' })).toBeVisible()
})

test('password recovery requests an email and handles expired links', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '¿Olvidaste tu contraseña?' }).click()
  await page.getByLabel('Correo electrónico', { exact: true }).fill(user.email)
  const request = page.waitForRequest('**/auth/v1/recover**')
  await page.getByRole('button', { name: 'Enviar enlace' }).click()
  expect((await request).url()).toContain('reset-password')
  await expect(page.getByRole('status')).toContainText('recibirás un enlace')
  await page.goto('/reset-password')
  await expect(page.getByText('El enlace ya no es válido', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Solicitar otro enlace' }).click()
  await expect(page.getByRole('button', { name: 'Enviar enlace' })).toBeVisible()
  await noOverflow(page)
})

test('recovery callback requires matching passwords and updates the account', async ({ page }) => {
  await page.goto('/reset-password#access_token=test-access-token&refresh_token=test-refresh-token&expires_in=3600&token_type=bearer&type=recovery')
  await page.getByLabel('Nueva contraseña', { exact: true }).fill('NuevaClave123!')
  await page.getByLabel('Confirmar contraseña').fill('Diferente123!')
  await page.getByRole('button', { name: 'Guardar contraseña' }).click()
  await expect(page.getByRole('alert')).toHaveText('Las contraseñas no coinciden.')
  await page.getByLabel('Confirmar contraseña').fill('NuevaClave123!')
  const update = page.waitForRequest(request => request.url().includes('/auth/v1/user') && request.method() === 'PUT')
  await page.getByRole('button', { name: 'Guardar contraseña' }).click()
  expect((await update).postDataJSON().password).toBe('NuevaClave123!')
  await expect(page.getByRole('button', { name: 'Mi cuenta' })).toBeVisible()
})

test('course study and main routes fit the viewport with one workspace explorer', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await login(page)
  await page.screenshot({ path: info.outputPath('home.png'), fullPage: true })
  for (const route of ['/courses', '/courses/course-bio/materials/mat-cell', '/resolver', '/corrector', '/progress']) {
    await page.goto(route)
    await expect(page.getByRole('button', { name: 'Mi cuenta' })).toBeVisible()
    await noOverflow(page)
    await page.screenshot({ path: info.outputPath(`${route.slice(1).replaceAll('/', '-')}.png`), fullPage: true })
  }
  await expect(page.locator('.sidebar nav').getByRole('button', { name: 'Espacios', includeHidden: true })).toHaveCount(0)
  await expect(page.locator('.sidebar nav').getByRole('button', { name: 'Estudiar', includeHidden: true })).toHaveCount(0)
  await page.getByRole('button', { name: /Cambiar espacio de estudio/ }).click()
  await expect(page.getByRole('dialog', { name: 'Explorador de espacios' })).toBeVisible()
  await noOverflow(page)
  await page.screenshot({ path: info.outputPath('explorer.png'), fullPage: true })
  await page.getByRole('button', { name: 'Cerrar explorador de espacios' }).last().click()
  await page.goto('/folders')
  await expect(page).toHaveURL(/\/courses$/)
  await expect(page.getByRole('dialog', { name: 'Explorador de espacios' })).toBeVisible()
  await page.getByRole('button', { name: 'Cerrar explorador de espacios' }).last().click()
  await page.goto('/study')
  await expect(page).toHaveURL(/\/courses$/)
  if (page.viewportSize()!.width <= 700) {
    const nav = page.getByRole('navigation', { name: 'Navegación móvil' })
    await expect(nav).toBeVisible()
    await expect(nav.getByRole('button', { name: 'Espacios' })).toHaveCount(0)
    await expect(nav.getByRole('button', { name: 'Estudiar' })).toHaveCount(0)
    await nav.getByRole('button', { name: 'Corrector' }).click()
    await expect(page).toHaveURL(/\/corrector$/)
    await nav.getByRole('button', { name: 'Progreso' }).click()
    await expect(page).toHaveURL(/\/progress$/)
    for (const button of await nav.getByRole('button').all()) {
      const box = (await button.boundingBox())!
      expect(box.width).toBeGreaterThanOrEqual(44)
      expect(box.height).toBeGreaterThanOrEqual(44)
    }
  }
  expect(errors).toEqual([])
})

test('bad URLs and malformed saved courses recover without a blank page', async ({ page }) => {
  await login(page)
  await page.evaluate(id => localStorage.setItem(`nexo-study-courses-v5:${id}`, JSON.stringify({ bad: true })), user.id)
  await page.goto('/courses')
  await expect(page.getByRole('button', { name: 'Mi cuenta' })).toBeVisible()
  await page.evaluate(() => { window.history.pushState({}, '', '/courses/%invalid'); window.dispatchEvent(new PopStateEvent('popstate')) })
  await expect(page.getByRole('heading', { name: 'Mis cursos', level: 2 })).toBeVisible()
  await noOverflow(page)
})

test('create a course and material, study it, and use accessible scrollable dialogs', async ({ page }, info) => {
  await login(page)
  await page.goto('/courses')
  await page.getByRole('button', { name: /Nuevo curso/ }).first().click()
  let dialog = page.getByRole('dialog')
  await dialog.getByLabel('Nombre del curso').fill('Biología celular — apuntes para mi próximo examen')
  await dialog.getByRole('button', { name: 'Crear curso' }).click()
  await expect(dialog).not.toBeVisible()
  await page.getByRole('button', { name: /Agregar material/ }).first().click()
  dialog = page.getByRole('dialog')
  await dialog.getByLabel('Título', { exact: true }).fill('Estructura y funciones de la célula')
  await dialog.getByRole('textbox', { name: 'Texto extraído / apuntes' }).fill('La célula es la unidad básica de los seres vivos. La membrana celular regula el paso de sustancias. El núcleo contiene el ADN y dirige la actividad celular. Las mitocondrias producen energía mediante respiración celular. Los ribosomas sintetizan proteínas. El citoplasma contiene los orgánulos celulares.')
  await dialog.getByRole('button', { name: 'Guardar y estudiar' }).click()
  await expect(page.getByRole('heading', { name: 'Estructura y funciones de la célula' }).first()).toBeVisible()
  await noOverflow(page)
  await page.getByRole('button', { name: 'Flashcards', exact: true }).click()
  await expect(page.locator('.flashcard')).toBeVisible()
  await page.locator('.flashcard').click()
  await expect(page.locator('.flashcard')).toContainText('RESPUESTA')
  await page.screenshot({ path: info.outputPath('flashcard.png'), fullPage: true })
  await page.getByRole('button', { name: 'Enviar retroalimentación' }).click()
  dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await noOverflow(page)
  await page.screenshot({ path: info.outputPath('feedback.png'), fullPage: true })
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(page.getByRole('button', { name: 'Enviar retroalimentación' })).toBeFocused()
})

test('signup wizard: required choices, back navigation and confirmation email state', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Crear una cuenta' }).click()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await expect(page.getByRole('alert')).toContainText('nombres completos')
  await page.getByLabel('Nombres completos').fill('Estudiante Nexo')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Universidad', exact: false }).click()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Ingeniería y tecnología', exact: false }).click()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Prepararme para exámenes', exact: false }).click()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await noOverflow(page)
  await page.getByLabel('Correo', { exact: true }).fill(user.email)
  await page.getByLabel('Contraseña', { exact: true }).fill('UnaClave123!')
  await page.getByRole('button', { name: 'Crear mi espacio' }).click()
  await expect(page.getByRole('status')).toContainText('Revisa tu correo', { timeout: 15000 })
})
