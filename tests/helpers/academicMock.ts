import { expect, type Page } from '@playwright/test'
import type { Course } from '../../src/types'

export const user = { id: '12345678-1234-4234-8234-123456789012', aud: 'authenticated', role: 'authenticated', email: 'cohesion@example.com', user_metadata: { full_name: 'Sebastián' }, app_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: 'test-access-token', refresh_token: 'test-refresh-token', token_type: 'bearer', expires_in: 3600, user }
export const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB3sAAAAASUVORK5CYII=', 'base64')
type Row = Record<string, unknown>

export async function academicMock(page: Page, options: { identity?: typeof user; rows?: Map<string, Map<string, Row>> } = {}) {
  const identity = options.identity ?? user
  const rows = options.rows ?? new Map<string, Map<string, Row>>()
  const requests: { table: string; method: string; url: string; body: unknown }[] = []
  const uploaded: string[] = []
  const removed: string[] = []
  const signed: string[] = []
  const control = { failUpload: 0, failRemoval: false, failConversation: false, failEvidence: false, failConversationUpload: false }
  const conversationUploaded: string[] = []
  const tableRows = (name: string) => {
    const table = rows.get(name) ?? new Map<string, Row>()
    rows.set(name, table)
    return table
  }
  const splitTerms = (value: string) => {
    const result: string[] = []; let depth = 0, start = 0
    for (let i=0;i<value.length;i++) { if(value[i]==='(') depth++; if(value[i]===')') depth--; if(value[i]===',' && depth===0) { result.push(value.slice(start,i)); start=i+1 } }
    result.push(value.slice(start)); return result
  }
  const expression = (row: Row, value: string): boolean => {
    if (value.startsWith('and(')) return splitTerms(value.slice(4,-1)).every(term => expression(row,term))
    const match = value.match(/^([^\.]+)\.(eq|lt|is|in)\.(.*)$/)
    if (!match) return true
    const [,key,op,expected] = match
    return op==='eq' ? String(row[key])===expected : op==='lt' ? String(row[key])<expected : op==='is' ? row[key]==null : expected.slice(1,-1).split(',').includes(String(row[key]))
  }
  const matches = (row: Row, url: URL) => [...url.searchParams].every(([key, value]) => {
    if (key === 'or') return splitTerms(value.slice(1,-1)).some(term => expression(row,term))
    if (value === 'is.null') return row[key] == null
    if (value === 'not.is.null') return row[key] != null
    if (value.startsWith('lt.')) return String(row[key]) < value.slice(3)
    if (value.startsWith('eq.')) return String(row[key]) === value.slice(3)
    if (value.startsWith('in.(')) return value.slice(4, -1).split(',').map(item => item.replaceAll('"', '')).includes(String(row[key]))
    if (value.startsWith('ilike.')) return String(row[key]).toLowerCase().includes(value.slice(6).replaceAll('%', '').toLowerCase())
    return true
  })
  await page.route('**/auth/v1/**', route => route.fulfill({ json: new URL(route.request().url()).pathname.endsWith('/user') ? identity : { ...session, user: identity, access_token: `test-token-${identity.id}` } }))
  await page.route('**/rest/v1/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    const table = url.pathname.split('/').at(-1) ?? ''
    const method = request.method()
    const body = request.postData() ? request.postDataJSON() : null
    requests.push({ table, method, url: url.toString(), body })
    const fail = (message = 'Ownership denied') => route.fulfill({ status: 403, json: { message, code: '42501' } })
    const conceptState = (materialId: string, conceptKey: string) => {
      const key = `${materialId}:${conceptKey}`
      const states = tableRows('learning_state')
      const old = states.get(key)
      const baseline = old?.evidence_managed ? old.legacy_baseline as Row ?? {} : old ? { attempts: old.attempts, correct: old.correct_attempts, confidence: old.confidence } : {}
      let attempts = Number(baseline.attempts ?? 0), correct = Number(baseline.correct ?? 0), confidence = Number(baseline.confidence ?? 0)
      const evidence = [...tableRows('concept_evidence').values()].filter(row => row.user_id === identity.id && row.material_id === materialId && row.concept_key === conceptKey).sort((a,b) => String(a.created_at).localeCompare(String(b.created_at)))
      for (const row of evidence) if (Number(row.weight) > 0) {
        attempts++; if (row.result === 'good' || row.result === 'easy') correct++
        confidence = Math.round((confidence * (1 - .36 * Number(row.weight)) + ({ again: 0, hard: .35, good: .78, easy: 1 }[String(row.result)] ?? 0) * .36 * Number(row.weight)) * 1000) / 1000
      }
      const last = evidence[evidence.length-1] ?? old
      if (!last) return undefined
      const practiced = evidence.filter(row => Number(row.weight)>0).slice(-1)[0]
      const state = { ...old, id: old?.id ?? crypto.randomUUID(), user_id: identity.id, material_id: materialId, course_id: last.course_id, concept_key: conceptKey,
        concept_label: last.concept_label, status: attempts >= 3 && confidence >= .82 ? 'mastered' : attempts >= 2 && confidence >= .53 ? 'known' : attempts ? 'learning' : 'unknown',
        attempts, correct_attempts: correct, confidence, evidence_managed: true, legacy_baseline: baseline, evidence_count: evidence.length,
        last_seen: last.created_at, last_practiced: practiced?.created_at, last_result: practiced?.result, updated_at: new Date().toISOString() }
      states.set(key,state); return state
    }
    if (table === 'append_conversation_message') {
      if (control.failConversation) return route.fulfill({ status: 503, json: { message: 'Sync unavailable' } })
      const t = body.p_thread, m = body.p_message
      const threads = tableRows('conversation_threads'), messages = tableRows('conversation_messages')
      const existing = threads.get(t.id)
      if (t.ensure_existing && !existing) return fail('Conversation was deleted')
      if (existing && existing.user_id !== identity.id) return fail()
      if (t.scope !== 'general') {
        if (tableRows('courses').get(t.course_id)?.user_id !== identity.id) return fail()
        const material = t.material_id ? tableRows('materials').get(t.material_id) : undefined
        if (t.scope === 'material' && (!material || material.user_id !== identity.id || material.course_id !== t.course_id)) return fail()
      }
      if (existing && (existing.scope !== t.scope || existing.course_id !== t.course_id || existing.material_id !== t.material_id || existing.archived_at)) return fail('Context mismatch')
      const prior = messages.get(m.id)
      if (prior && (prior.user_id !== identity.id || prior.thread_id !== t.id || prior.content !== m.content)) return fail('Identity conflict')
      const now = new Date().toISOString()
      const thread = { ...t, ...existing, user_id: identity.id, created_at: existing?.created_at ?? now, updated_at: now, last_message_at: now, archived_at: null }
      const message = prior ?? { ...m, user_id: identity.id, thread_id: t.id, created_at: now }
      threads.set(t.id,thread); messages.set(m.id,message)
      return route.fulfill({ json: { thread, message } })
    }
    if (table === 'record_concept_evidence') {
      if (control.failEvidence) return route.fulfill({ status: 503, json: { message: 'Evidence unavailable' } })
      const e = body.p_evidence
      const mat = tableRows('materials').get(e.material_id)
      if (!mat || mat.user_id !== identity.id || mat.course_id !== e.course_id) return fail()
      if (e.thread_id) {
        const t = tableRows('conversation_threads').get(e.thread_id), m = tableRows('conversation_messages').get(e.message_id)
        if (!t || t.user_id !== identity.id || t.course_id !== e.course_id || t.material_id && t.material_id !== e.material_id || !m || m.thread_id !== e.thread_id) return fail()
      }
      const records = tableRows('concept_evidence'), prior = records.get(e.id)
      if (prior && (prior.user_id !== identity.id || prior.result !== e.result || prior.material_id !== e.material_id)) return fail()
      if (!prior) records.set(e.id, { ...e, user_id: identity.id, weight: e.source_type === 'chat' ? 0 : e.source_type === 'written' ? .5 : 1, created_at: new Date().toISOString() })
      return route.fulfill({ json: conceptState(e.material_id,e.concept_key) })
    }
    if (table === 'reset_course_learning_memory') {
      if (tableRows('courses').get(body.p_course_id)?.user_id !== identity.id) return fail()
      for (const [key,row] of tableRows('concept_evidence')) if (row.user_id === identity.id && row.course_id === body.p_course_id) tableRows('concept_evidence').delete(key)
      for (const row of tableRows('learning_state').values()) if (row.user_id === identity.id && row.course_id === body.p_course_id) {
        row.legacy_baseline = {}; row.evidence_managed = true; conceptState(String(row.material_id),String(row.concept_key))
      }
      return route.fulfill({ json: null })
    }
    const records = tableRows(table)
    let selected = [...records.values()].filter(row => (!row.user_id || row.user_id === identity.id) && matches(row, url))
    const order = url.searchParams.get('order')
    if (order) selected.sort((a,b) => { for (const item of order.split(',')) { const [key,direction] = item.split('.'); const compared = String(a[key] ?? '').localeCompare(String(b[key] ?? '')); if (compared) return direction === 'desc' ? -compared : compared } return 0 })
    const limit = Number(url.searchParams.get('limit')); if (limit) selected = selected.slice(0,limit)
    const single = request.headers().accept?.includes('vnd.pgrst.object')
    if (method === 'GET') return route.fulfill({ json: single ? selected[0] ?? {} : selected })
    if (method === 'POST') {
      const incoming: Row[] = Array.isArray(body) ? body : [body]
      if (incoming.some(row => row.user_id && row.user_id !== identity.id)) return fail()
      for (const row of incoming) {
        const key = table === 'study_progress' ? String(row.material_id) : table === 'learning_state' ? `${row.material_id}:${row.concept_key}` : String(row.id ?? crypto.randomUUID())
        if (table === 'learning_state' && records.get(key)?.evidence_managed) continue
        records.set(key, { ...records.get(key), ...row })
      }
      return route.fulfill({ status: 201, json: single ? incoming[0] : incoming })
    }
    if (method === 'PATCH') {
      const updated = selected.map(row => ({ ...row, ...body }))
      for (const row of updated) records.set(String(row.id), row)
      return route.fulfill({ json: single ? updated[0] : updated })
    }
    if (method === 'DELETE') for (const [key,row] of records) if ((!row.user_id || row.user_id === identity.id) && matches(row,url)) {
      records.delete(key)
      if (table === 'concept_evidence') conceptState(String(row.material_id),String(row.concept_key))
      if (table === 'conversation_threads') {
        for (const [id,message] of tableRows('conversation_messages')) if (message.thread_id === row.id) tableRows('conversation_messages').delete(id)
        for (const [id,evidence] of tableRows('concept_evidence')) if (evidence.thread_id === row.id) { tableRows('concept_evidence').delete(id); conceptState(String(evidence.material_id),String(evidence.concept_key)) }
      }
    }
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
      if (url.pathname.includes('/conversation-images/')) {
        if (control.failConversationUpload) return route.fulfill({ status: 503, json: { message: 'Image sync failed' } })
        conversationUploaded.push(url.pathname); return route.fulfill({ json: { Key: url.pathname } })
      }
      if (control.failUpload === uploaded.length + 1) return route.fulfill({ status: 503, json: { message: 'Upload failed' } })
      uploaded.push(url.pathname.split('/solution-images/')[1])
      return route.fulfill({ json: { Key: url.pathname } })
    }
    return route.fulfill({ status: 200, contentType: 'image/png', body: png })
  })
  return { rows, requests, conversationUploaded, uploaded, removed, signed, control, seedCourse(course: Course) {
    tableRows('courses').set(course.id, { id: course.id, user_id: identity.id, name: course.name, emoji: course.emoji })
    for (const material of course.materials) {
      tableRows('materials').set(material.id, { id: material.id, user_id: identity.id, course_id: course.id, title: material.title, content: material.text,
        source_type: material.sourceType ?? 'text', source_name: material.sourceName, pages: material.pages ?? [], page_count: material.pageCount,
        processing_status: 'ready', analysis_status: material.analysisStatus ?? 'ready', analyzed_pages: material.analyzedPages ?? [], document_kind: 'text', created_at: material.createdAt, study_pack: material.studyPack })
      for (const chunk of material.chunks ?? []) tableRows('material_chunks').set(chunk.id, { id: chunk.id, user_id: identity.id, course_id: course.id, material_id: material.id, page_start: chunk.pageStart, page_end: chunk.pageEnd, content: chunk.text, keywords: chunk.keywords })
      for (const topic of material.topics ?? []) tableRows('material_topics').set(topic.id, { id: topic.id, user_id: identity.id, course_id: course.id, material_id: material.id, title: topic.title, summary: topic.summary, page_start: topic.pageStart, page_end: topic.pageEnd, keywords: topic.keywords })
      for (const artifact of material.artifacts ?? []) tableRows('study_artifacts').set(artifact.id, { ...artifact, user_id: identity.id, course_id: course.id, source_material_id: material.id, created_at: artifact.createdAt, updated_at: artifact.updatedAt })
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
