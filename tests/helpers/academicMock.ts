import { expect, type Page } from '@playwright/test'
import type { Course } from '../../src/types'

export const user = { id: '12345678-1234-4234-8234-123456789012', aud: 'authenticated', role: 'authenticated', email: 'cohesion@example.com', user_metadata: { full_name: 'Sebastián' }, app_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: 'test-access-token', refresh_token: 'test-refresh-token', token_type: 'bearer', expires_in: 3600, user }
export const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB3sAAAAASUVORK5CYII=', 'base64')
type Row = Record<string, unknown>

export async function academicMock(page: Page) {
  const rows = new Map<string, Map<string, Row>>()
  const requests: { table: string; method: string; url: string; body: unknown }[] = []
  const uploaded: string[] = []
  const removed: string[] = []
  const signed: string[] = []
  const control = { failUpload: 0, failRemoval: false }
  const tableRows = (name: string) => {
    const table = rows.get(name) ?? new Map<string, Row>()
    rows.set(name, table)
    return table
  }
  const matches = (row: Row, url: URL) => [...url.searchParams].every(([key, value]) => {
    if (value.startsWith('eq.')) return String(row[key]) === value.slice(3)
    if (value.startsWith('in.(')) return value.slice(4, -1).split(',').map(item => item.replaceAll('"', '')).includes(String(row[key]))
    if (value.startsWith('ilike.')) return String(row[key]).toLowerCase().includes(value.slice(6).replaceAll('%', '').toLowerCase())
    return true
  })
  await page.route('**/auth/v1/**', route => route.fulfill({ json: new URL(route.request().url()).pathname.endsWith('/user') ? user : session }))
  await page.route('**/rest/v1/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    const table = url.pathname.split('/').at(-1) ?? ''
    const method = request.method()
    const body = request.postData() ? request.postDataJSON() : null
    requests.push({ table, method, url: url.toString(), body })
    const records = tableRows(table)
    const selected = [...records.values()].filter(row => matches(row, url))
    const single = request.headers().accept?.includes('vnd.pgrst.object')
    if (method === 'GET') return route.fulfill({ json: single ? selected[0] ?? {} : selected })
    if (method === 'POST') {
      const incoming: Row[] = Array.isArray(body) ? body : [body]
      for (const row of incoming) {
        const key = table === 'study_progress' ? String(row.material_id) : table === 'learning_state' ? `${row.material_id}:${row.concept_key}` : String(row.id ?? crypto.randomUUID())
        records.set(key, { ...records.get(key), ...row })
      }
      return route.fulfill({ status: 201, json: single ? incoming[0] : incoming })
    }
    if (method === 'PATCH') {
      const updated = selected.map(row => ({ ...row, ...body }))
      for (const row of updated) records.set(String(row.id), row)
      return route.fulfill({ json: single ? updated[0] : updated })
    }
    if (method === 'DELETE') for (const [key, row] of records) if (matches(row, url)) records.delete(key)
    return route.fulfill({ json: [] })
  })
  await page.route('**/storage/v1/**', async route => {
    const url = new URL(route.request().url())
    if (url.pathname.includes('/object/sign/') && route.request().method() === 'POST') {
      signed.push(url.pathname)
      return route.fulfill({ json: { signedURL: '/object/sign/solution-images/fixture.png?token=short-lived' } })
    }
    if (url.pathname.includes('/object/list/')) return route.fulfill({ json: [] })
    if (route.request().method() === 'DELETE') {
      if (control.failRemoval) return route.fulfill({ status: 503, json: { message: 'Removal failed' } })
      removed.push(...route.request().postDataJSON().prefixes)
      return route.fulfill({ json: [] })
    }
    if (route.request().method() === 'POST') {
      if (control.failUpload === uploaded.length + 1) return route.fulfill({ status: 503, json: { message: 'Upload failed' } })
      uploaded.push(url.pathname.split('/solution-images/')[1])
      return route.fulfill({ json: { Key: url.pathname } })
    }
    return route.fulfill({ status: 200, contentType: 'image/png', body: png })
  })
  return { rows, requests, uploaded, removed, signed, control, seedCourse(course: Course) {
    tableRows('courses').set(course.id, { id: course.id, user_id: user.id, name: course.name, emoji: course.emoji })
    for (const material of course.materials) {
      tableRows('materials').set(material.id, { id: material.id, user_id: user.id, course_id: course.id, title: material.title, content: material.text,
        source_type: material.sourceType ?? 'text', source_name: material.sourceName, pages: material.pages ?? [], page_count: material.pageCount,
        processing_status: 'ready', analysis_status: material.analysisStatus ?? 'ready', analyzed_pages: material.analyzedPages ?? [], document_kind: 'text', created_at: material.createdAt, study_pack: material.studyPack })
      for (const chunk of material.chunks ?? []) tableRows('material_chunks').set(chunk.id, { id: chunk.id, user_id: user.id, course_id: course.id, material_id: material.id, page_start: chunk.pageStart, page_end: chunk.pageEnd, content: chunk.text, keywords: chunk.keywords })
      for (const artifact of material.artifacts ?? []) tableRows('study_artifacts').set(artifact.id, { ...artifact, user_id: user.id, course_id: course.id, source_material_id: material.id, created_at: artifact.createdAt, updated_at: artifact.updatedAt })
    }
  } }
}

export async function login(page: Page) {
  await page.goto('/')
  await page.getByLabel('Correo electrónico', { exact: true }).fill(user.email)
  await page.getByLabel('Contraseña', { exact: true }).fill('UnaClave123!')
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page.getByRole('button', { name: 'Mi cuenta' })).toBeVisible()
}
