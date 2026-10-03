import { expect, test } from '@playwright/test'
import { academicMock } from './helpers/academicMock'

const user = { id: '12345678-1234-4234-8234-123456789012', aud: 'authenticated', role: 'authenticated', email: 'sincronizacion@example.com', user_metadata: { full_name: 'Estudiante Nexo' }, app_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: 'test-access-token', refresh_token: 'test-refresh-token', token_type: 'bearer', expires_in: 3600, user }

test('courses and material text restore from the academic repository after local data is removed', async ({ page }) => {
  const academic = new Map<string, Map<string, Record<string, unknown>>>()
  await academicMock(page,{identity:user,rows:academic})
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
  await dialog.getByRole('button', { name: /^Apuntes/ }).click()
  await dialog.getByRole('textbox', { name: 'Título' }).fill('Energía cinética')
  await dialog.getByRole('textbox', { name: 'Tus apuntes' }).fill('La energía cinética depende de la masa y del cuadrado de la velocidad.')
  await dialog.getByRole('button', { name: 'Guardar y abrir material' }).click()
  await expect.poll(() => [...(academic.get('materials')?.values() ?? [])].some(row => row.title === 'Energía cinética' && String(row.content).includes('cuadrado de la velocidad'))).toBe(true)
  await expect.poll(() => [...(academic.get('study_artifacts')?.values() ?? [])].some(row => row.type === 'summary' && row.status === 'ready')).toBe(true)

  await page.evaluate(id => localStorage.removeItem(`nexo-study-courses-v5:${id}`), user.id)
  await page.reload()
  await page.goto('/courses')
  await expect(page.locator('.course-library-card').filter({ hasText: 'Física remota' })).toBeVisible()
  await page.locator('.course-library-card').filter({ hasText: 'Física remota' }).click()
  await page.locator('.material-card').filter({ hasText: 'Energía cinética' }).click()
  await expect(page.locator('.document-reader')).toContainText('cuadrado de la velocidad')
  if(await page.locator('.study-focus-shell').count()) await page.getByRole('button',{name:'Volver al material o curso'}).click()
  await page.getByRole('button',{name:'← Física remota',exact:true}).click()
  await page.getByRole('navigation', { name: 'Secciones de Física remota' }).getByRole('button', { name: 'Biblioteca' }).click()
  await expect(page.locator('.library-entry').filter({ hasText: 'Resumen' })).toBeVisible()
  expect([...(academic.get('courses')?.values() ?? [])].filter(row => row.name === 'Física remota')).toHaveLength(1)
})
