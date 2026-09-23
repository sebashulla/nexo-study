import { test, expect, type Page } from '@playwright/test'

const user = { id: '12345678-1234-4234-8234-123456789012', aud: 'authenticated', role: 'authenticated', email: 'estudiante@example.com', user_metadata: { full_name: 'Estudiante Nexo' }, app_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: 'test-access-token', refresh_token: 'test-refresh-token', token_type: 'bearer', expires_in: 3600, user }

test.beforeEach(async ({ page }) => {
  const folders: Array<{ id: string; name: string; emoji: string; created_at: string }> = []
  const memberships: Array<{ folder_id: string; course_key: string }> = []
  await page.route('**/auth/v1/**', route => {
    const url = new URL(route.request().url())
    return route.fulfill({ json: url.pathname.endsWith('/user') ? user : session })
  })
  await page.route('**/rest/v1/**', async route => {
    const url = new URL(route.request().url())
    const method = route.request().method()
    if (url.pathname.endsWith('/study_folders')) {
      if (method === 'GET') return route.fulfill({ json: folders })
      if (method === 'POST') {
        const body = route.request().postDataJSON()
        const folder = { id: `folder-${folders.length + 1}`, name: body.name, emoji: body.emoji, created_at: new Date().toISOString() }
        folders.push(folder)
        return route.fulfill({ status: 201, json: folder })
      }
      if (method === 'DELETE') {
        const id = url.searchParams.get('id')?.slice(3)
        const index = folders.findIndex(folder => folder.id === id)
        if (index !== -1) folders.splice(index, 1)
        for (let i = memberships.length - 1; i >= 0; i--) if (memberships[i].folder_id === id) memberships.splice(i, 1)
        return route.fulfill({ status: 204, body: '' })
      }
    }
    if (url.pathname.endsWith('/folder_courses')) {
      if (method === 'GET') return route.fulfill({ json: memberships })
      if (method === 'POST') {
        const body = route.request().postDataJSON()
        const index = memberships.findIndex(item => item.course_key === body.course_key)
        if (index !== -1) memberships.splice(index, 1)
        memberships.push({ folder_id: body.folder_id, course_key: body.course_key })
        return route.fulfill({ status: 201, json: {} })
      }
      if (method === 'DELETE') {
        const course = url.searchParams.get('course_key')?.slice(3)
        for (let i = memberships.length - 1; i >= 0; i--) if (memberships[i].course_key === course) memberships.splice(i, 1)
        return route.fulfill({ status: 204, body: '' })
      }
    }
    return route.fulfill({ json: [] })
  })
})

async function login(page: Page) {
  await page.goto('/')
  await page.getByLabel('Correo electrónico', { exact: true }).fill(user.email)
  await page.getByLabel('Contraseña', { exact: true }).fill('UnaClave123!')
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page.getByRole('button', { name: /Cambiar espacio de estudio/ })).toBeVisible()
}

async function switchTo(page: Page, name: string) {
  const trigger = page.getByRole('button', { name: /Cambiar espacio de estudio/ })
  if (await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click()
  await page.getByRole('group', { name: 'Espacios de estudio' }).getByRole('button', { name: new RegExp(name) }).click()
  await page.getByRole('button', { name: 'Cerrar explorador de espacios' }).last().click()
}

async function createWorkspace(page: Page, name: string) {
  await page.getByRole('button', { name: /Cambiar espacio de estudio/ }).click()
  await page.getByRole('button', { name: 'Nuevo espacio' }).click()
  await page.getByRole('textbox', { name: 'Nombre del espacio' }).fill(name)
  await page.getByRole('button', { name: 'Crear espacio', exact: true }).click()
  await expect(page.getByRole('button', { name: `Cambiar espacio de estudio. Actual: ${name}` })).toBeVisible()
  await page.getByRole('button', { name: 'Cerrar explorador de espacios' }).last().click()
}

test('a workspace owns new courses and restores the selected world after reload', async ({ page }, info) => {
  await login(page)
  await createWorkspace(page, 'Ciclo clínico')
  await page.goto('/courses')
  await expect(page.getByRole('heading', { name: 'Aún no hay cursos aquí' })).toBeVisible()
  await page.getByRole('button', { name: 'Nuevo curso' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Nombre del curso').fill('Histología clínica')
  await dialog.getByRole('button', { name: 'Crear curso' }).click()
  await expect(page.getByRole('heading', { name: 'Histología clínica' }).first()).toBeVisible()
  await page.goto('/courses')
  await expect(page.getByRole('button', { name: /Histología clínica/ })).toBeVisible()
  await page.screenshot({ path: info.outputPath('own-courses.png'), fullPage: true })
  await switchTo(page, 'General')
  await expect(page.getByRole('button', { name: /Histología clínica/ })).toHaveCount(0)
  await page.goto('/courses')
  await expect(page.getByRole('button', { name: /Biología/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Histología clínica/ })).toHaveCount(0)
  await switchTo(page, 'Ciclo clínico')
  await page.reload()
  await expect(page.getByRole('button', { name: 'Cambiar espacio de estudio. Actual: Ciclo clínico' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Histología clínica/ })).toBeVisible()
  await switchTo(page, 'General')
  await page.goto('/courses')
  const folderCourse = await page.evaluate(userId => {
    const raw = localStorage.getItem(`nexo-study-courses-v5:${userId}`)
    return JSON.parse(raw || '[]').find((course: { name: string }) => course.name === 'Histología clínica')?.id
  }, user.id)
  await page.goto(`/courses/${folderCourse}`)
  await expect(page.getByRole('button', { name: 'Cambiar espacio de estudio. Actual: Ciclo clínico' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy()
})

test('moving a course transfers its real progress and deleting the workspace returns it to General', async ({ page }, info) => {
  await login(page)
  await page.goto('/courses/course-bio/materials/mat-cell')
  await expect(page.getByRole('heading', { name: 'Introducción a la célula' }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Flashcards', exact: true }).click()
  await page.locator('.flashcard').click()
  await page.getByRole('button', { name: 'Quiz', exact: true }).click()
  await page.locator('.quiz-card .options button').first().click()
  await page.goto('/progress')
  const originalProgress = Number((await page.locator('.progress-overall strong').textContent())?.replace('%', ''))
  expect(originalProgress).toBeGreaterThan(0)
  await createWorkspace(page, 'Exámenes')
  await page.getByRole('button', { name: /Cambiar espacio de estudio/ }).click()
  await page.getByRole('button', { name: 'Traer curso' }).first().click()
  await page.locator('.spaces-bring').getByRole('button', { name: /Biología/ }).click()
  await expect(page.locator('.explorer-course-open').filter({ hasText: 'Biología' })).toBeVisible()
  await page.screenshot({ path: info.outputPath('space-with-course.png'), fullPage: true })
  await page.getByRole('button', { name: 'Cerrar explorador de espacios' }).last().click()
  await page.goto('/courses/course-bio/materials/mat-cell')
  await expect(page.getByRole('heading', { name: 'Introducción a la célula' }).first()).toBeVisible()
  await page.goto('/progress')
  await expect(page.getByRole('heading', { name: 'Biología' })).toBeVisible()
  expect(Number((await page.locator('.progress-overall strong').textContent())?.replace('%', ''))).toBe(originalProgress)
  await page.reload()
  await expect(page.locator('.progress-overall strong')).toHaveText(`${originalProgress}%`)
  await page.screenshot({ path: info.outputPath('space-progress.png'), fullPage: true })
  await switchTo(page, 'General')
  await page.goto('/courses')
  await expect(page.getByRole('button', { name: /Biología/ })).toHaveCount(0)
  await page.goto('/progress')
  await expect(page.locator('.progress-overall strong')).toHaveText('0%')
  await switchTo(page, 'Exámenes')
  await page.getByRole('button', { name: /Cambiar espacio de estudio/ }).click()
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Eliminar espacio' }).click()
  await expect(page.getByRole('button', { name: 'Cambiar espacio de estudio. Actual: General' })).toBeVisible()
  await page.getByRole('button', { name: 'Cerrar explorador de espacios' }).last().click()
  await page.goto('/courses')
  await expect(page.getByRole('button', { name: /Biología/ })).toBeVisible()
  await page.goto('/progress')
  expect(Number((await page.locator('.progress-overall strong').textContent())?.replace('%', ''))).toBe(originalProgress)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy()
})

test('resolver history belongs to the selected space', async ({ page }) => {
  await login(page)
  await page.evaluate(userId => localStorage.setItem(`nexo-study-resolver-history-v3:${userId}`, JSON.stringify([{ question: 'Pregunta de General', category: 'Biología', answer: 'Respuesta anterior', createdAt: new Date().toISOString(), deep: false, imageCount: 0 }])), user.id)
  await page.goto('/resolver')
  await expect(page.getByRole('button', { name: /Pregunta de General/ })).toBeVisible()
  await createWorkspace(page, 'Laboratorio')
  await page.goto('/resolver')
  await expect(page.getByRole('button', { name: /Pregunta de General/ })).toHaveCount(0)
  await switchTo(page, 'General')
  await page.goto('/resolver')
  await expect(page.getByRole('button', { name: /Pregunta de General/ })).toBeVisible()
})

test('an unavailable workspace catalog never mixes courses into General', async ({ page }) => {
  await page.route('**/rest/v1/**', route => route.fulfill({ status: 503, json: { message: 'offline' } }))
  await page.goto('/')
  await page.getByLabel('Correo electrónico', { exact: true }).fill(user.email)
  await page.getByLabel('Contraseña', { exact: true }).fill('UnaClave123!')
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page.getByText('No pudimos cargar tus espacios', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /Biología/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Reintentar' })).toBeVisible()
})

test('a failed folder assignment does not create an unassigned course', async ({ page }) => {
  await login(page)
  await createWorkspace(page, 'Ciclo 3')
  await page.route('**/rest/v1/folder_courses*', route => {
    if (route.request().method() === 'POST') return route.fulfill({ status: 503, json: { message: 'offline' } })
    return route.fallback()
  })
  await page.goto('/courses')
  await page.getByRole('button', { name: 'Nuevo curso' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Nombre del curso').fill('Curso sin asignación')
  await dialog.getByRole('button', { name: 'Crear curso' }).click()
  await expect(dialog.getByRole('alert')).toContainText('No pudimos mover el curso')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancelar' }).click()
  await switchTo(page, 'General')
  await page.goto('/courses')
  await expect(page.getByRole('button', { name: /Curso sin asignación/ })).toHaveCount(0)
})
