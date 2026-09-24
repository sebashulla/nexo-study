import { expect, test } from '@playwright/test'

const user = { id: '12345678-1234-4234-8234-123456789012', aud: 'authenticated', role: 'authenticated', email: 'sincronizacion@example.com', user_metadata: { full_name: 'Estudiante Nexo' }, app_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: 'test-access-token', refresh_token: 'test-refresh-token', token_type: 'bearer', expires_in: 3600, user }

test('courses and material text restore from the academic repository after local data is removed', async ({ page }) => {
  const academic = new Map<string, Map<string, Record<string, unknown>>>()
  const tables = new Set(['courses', 'materials', 'study_progress', 'material_chunks', 'material_topics', 'study_artifacts', 'learning_state', 'study_sessions'])
  await page.route('**/auth/v1/**', route => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/token')) return route.fulfill({ json: session })
    if (url.pathname.endsWith('/user')) return route.fulfill({ json: user })
    return route.fulfill({ json: {} })
  })
  await page.route('**/rest/v1/**', route => {
    const url = new URL(route.request().url())
    const table = url.pathname.split('/').at(-1) || ''
    if (!tables.has(table)) return route.fulfill({ json: [] })
    const rows = academic.get(table) ?? new Map<string, Record<string, unknown>>()
    academic.set(table, rows)
    if (route.request().method() === 'GET') return route.fulfill({ json: [...rows.values()].filter(row =>
      row.user_id === user.id && [...url.searchParams].every(([key, value]) =>
        !value.startsWith('eq.') || String(row[key]) === value.slice(3))) })
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON()
      const items = Array.isArray(body) ? body : [body]
      for (const row of items) {
        const key = table === 'courses' || table === 'materials' || table === 'study_sessions'
          ? String(row.id) : table === 'study_progress' ? String(row.material_id)
            : table === 'learning_state' ? `${row.material_id}:${row.concept_key}` : String(row.id)
        rows.set(key, { ...(rows.get(key) ?? {}), ...row })
      }
      return route.fulfill({ status: 201, json: [] })
    }
    return route.fulfill({ json: [] })
  })

  await page.goto('/')
  await page.getByLabel('Correo electrónico', { exact: true }).fill(user.email)
  await page.getByLabel('Contraseña', { exact: true }).fill('UnaClave123!')
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page.getByRole('button', { name: 'Mi cuenta' })).toBeVisible()
  await page.goto('/courses')
  await page.getByRole('button', { name: /Nuevo curso/ }).first().click()
  let dialog = page.getByRole('dialog')
  await dialog.getByLabel('Nombre del curso').fill('Física remota')
  await dialog.getByRole('button', { name: 'Crear curso' }).click()
  await page.getByRole('button', { name: /Agregar material/ }).first().click()
  dialog = page.getByRole('dialog')
  await dialog.getByRole('textbox', { name: 'Título' }).fill('Energía cinética')
  await dialog.getByRole('textbox', { name: 'Texto extraído / apuntes' }).fill('La energía cinética depende de la masa y del cuadrado de la velocidad.')
  await dialog.getByRole('button', { name: 'Guardar y estudiar' }).click()
  await expect.poll(() => [...(academic.get('materials')?.values() ?? [])].some(row => row.title === 'Energía cinética' && String(row.content).includes('cuadrado de la velocidad'))).toBe(true)
  await expect.poll(() => [...(academic.get('study_artifacts')?.values() ?? [])].some(row => row.type === 'summary' && row.status === 'ready')).toBe(true)

  await page.evaluate(id => localStorage.removeItem(`nexo-study-courses-v5:${id}`), user.id)
  await page.reload()
  await page.goto('/courses')
  await expect(page.getByRole('button', { name: /Física remota/ })).toBeVisible()
  await page.getByRole('button', { name: /Física remota/ }).click()
  await expect(page.getByRole('button', { name: /Energía cinética/ })).toContainText('cuadrado de la velocidad')
  await page.getByRole('navigation', { name: 'Secciones de Física remota' }).getByRole('button', { name: 'Biblioteca' }).click()
  await expect(page.locator('.course-artifact-group')).toContainText('Resumen')
  expect([...(academic.get('courses')?.values() ?? [])].filter(row => row.name === 'Física remota')).toHaveLength(1)
})
