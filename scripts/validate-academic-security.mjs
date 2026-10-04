// Run against a disposable Supabase project after 001–010 + corrected recovery 013.
// Uses ordinary user sessions. No service role and no existing content is deleted.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

const env = process.env
const base = env.NEXO_TEST_SUPABASE_URL?.replace(/\/$/, '')
const key = env.NEXO_TEST_ANON_KEY
const tokens = [env.NEXO_TEST_USER_A_TOKEN, env.NEXO_TEST_USER_B_TOKEN]
if (!base || !key || tokens.some(token => !token)) throw new Error('Set NEXO_TEST_SUPABASE_URL, NEXO_TEST_ANON_KEY and both NEXO_TEST_USER_*_TOKEN variables. See sql/SECURITY_VALIDATION.md.')
if (key.startsWith('sb_secret_')) throw new Error('Secret/service keys are forbidden in this validation.')
function jwtRole(token) {
  try { return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).role } catch { return undefined }
}
if ([key, ...tokens].some(token => jwtRole(token) === 'service_role')) throw new Error('Service role bypasses RLS; use two ordinary users.')

async function request(token, path, method = 'GET', body, contentType = 'application/json') {
  const response = await fetch(`${base}${path}`, { method, headers: { apikey: key, Authorization: `Bearer ${token}`, 'Content-Type': contentType, Prefer: 'return=representation' }, body: body === undefined ? undefined : contentType === 'application/json' ? JSON.stringify(body) : body })
  const text = await response.text()
  let data
  try { data = JSON.parse(text) } catch { data = text }
  return { ok: response.ok, status: response.status, data }
}
const users = await Promise.all(tokens.map(token => request(token, '/auth/v1/user')))
assert(users.every(result => result.ok && result.data?.id), 'Both sessions must be valid.')
const ids = users.map(result => result.data.id)
assert.notEqual(ids[0], ids[1], 'User A and User B must be different accounts.')
assert(tokens.every(token => jwtRole(token) === 'authenticated'), 'Use authenticated user JWTs.')

const run = randomUUID()
const fixtures = ids.map(userId => {
  const courseId = `security-${run}-${userId}`
  const materialId = `material-${run}-${userId}`
  const solutionId = randomUUID(), sourceId=`${materialId}-source`
  const threadId = randomUUID(), messageId = randomUUID()
  const conversationImage = `${userId}/${threadId}/${messageId}/0.png`
  return { userId, courseId, materialId, solutionId, sourceId,sourceText:`${userId}/${courseId}/${sourceId}/original.txt`, threadId, messageId, conversationImage, uploadMaterialId: `${materialId}-upload-target`,
    pdf: `${userId}/${courseId}/${materialId}/original.pdf`,
    image: `${userId}/${courseId}/solutions/${solutionId}/fixture.png`,
    rows: {
      courses: { user_id: userId, id: courseId, name: 'Security fixture', emoji: '📘' },
      materials: { user_id: userId, course_id: courseId, id: materialId, title: 'Security fixture', content: 'Private text', source_type: 'pdf', page_count: 1 },
      material_chunks: { id: randomUUID(), user_id: userId, course_id: courseId, material_id: materialId, page_start: 1, page_end: 1, content: 'Private chunk' },
      study_artifacts: { id: randomUUID(), user_id: userId, course_id: courseId, source_material_id: materialId, type: 'summary', status: 'ready', version: 1, payload: { summary: 'Private summary' } },
      conversation_threads: { id: threadId, user_id: userId, scope: 'material', workspace_id: null, course_id: courseId, material_id: materialId, title: `Private conversation ${run}` },
      conversation_messages: { id: messageId, user_id: userId, thread_id: threadId, role: 'user', content: 'Private learning question', metadata: { attachments: [{storagePath:conversationImage,mimeType:'image/png',name:'fixture.png',bytes:68}],attachmentsReady:false } },
      concept_evidence: { id:randomUUID(), user_id:userId, course_id:courseId, material_id:materialId,concept_key:'private-concept',concept_label:'Private concept',source_type:'quiz',source_id:randomUUID(),result:'again',weight:1 },
      learning_state: { user_id:userId,course_id:courseId,material_id:materialId,concept_key:'private-concept',concept_label:'Private concept',status:'weak',confidence:0,attempts:1,correct_attempts:0 },
      saved_solutions: { id: solutionId, user_id: userId, course_id: courseId, question: 'Private question', answer: 'Private answer', source_key: run, status: 'ready' },
    } }
})
const fixtureFiles = [{bucket:'study-sources',field:'sourceText',mime:'text/plain',bytes:Buffer.from('La componente horizontal permanece constante en ausencia de fuerza horizontal.')}, { bucket: 'conversation-images', field: 'conversationImage', mime:'image/png', bytes:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB3sAAAAASUVORK5CYII=', 'base64') }, { bucket: 'study-pdfs', field: 'pdf', mime: 'application/pdf', bytes: Buffer.from('%PDF-1.4\n%%EOF') },
  { bucket: 'solution-images', field: 'image', mime: 'image/png', bytes: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB3sAAAAASUVORK5CYII=', 'base64') }]
const objectPath = (bucket, path) => `${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`
let passed = false
try {
  for (const [index, fixture] of fixtures.entries()) {
    for (const [table, row] of Object.entries(fixture.rows)) {
      if(table === 'learning_state') continue // Created by the evidence trigger.
      const inserted = await request(tokens[index], `/rest/v1/${table}`, 'POST', row)
      assert(inserted.ok, `Owner fixture insert failed: ${table}, HTTP ${inserted.status}`)
    }
    const uploadTarget = await request(tokens[index], '/rest/v1/materials', 'POST', { ...fixture.rows.materials, id: fixture.uploadMaterialId })
    assert(uploadTarget.ok, 'Owner must create the empty PDF upload target.')
    const source=await request(tokens[index],'/rest/v1/materials','POST',{user_id:fixture.userId,course_id:fixture.courseId,id:fixture.sourceId,title:'Private source',source_type:'text',metadata:{sourceRevision:1}})
    assert(source.ok,'Owner must create a universal source before private upload.')
    for (const file of fixtureFiles) {
      const uploaded = await request(tokens[index], `/storage/v1/object/${objectPath(file.bucket, fixture[file.field])}`, 'POST', file.bytes, file.mime)
      assert(uploaded.ok, `Owner upload failed: ${file.bucket}, HTTP ${uploaded.status}`)
    }
    const committed=await request(tokens[index],'/rest/v1/rpc/commit_source_document','POST',{p_course_id:fixture.courseId,p_material_id:fixture.sourceId,p_expected_revision:1,p_document:{title:'Private normalized source',text:'La componente horizontal permanece constante.',pages:[{page:1,heading:'Movimiento',text:'La componente horizontal permanece constante.'}],metadata:{sourceRevision:2,source:{units:[{page:1,heading:'Movimiento'}]}},analysis_status:'ready',chunks:[{id:randomUUID(),pageStart:1,pageEnd:1,text:'La componente horizontal permanece constante.',keywords:['horizontal']}],topics:[],summary:{summary:'Movimiento horizontal constante.'}}})
    assert(committed.ok,'Owner normalized document commit must succeed.')
  }
  // Test both directions, including an admin user if desired (admin has no private-content exception).
  for (const actor of [0, 1]) {
    const other = fixtures[1 - actor]
    for (const [table, row] of Object.entries(other.rows)) {
      const filter = `user_id=eq.${other.userId}&${table === 'learning_state' ? `material_id=eq.${other.materialId}&concept_key=eq.private-concept` : `id=eq.${encodeURIComponent(row.id)}`}`
      const path = `/rest/v1/${table}?${filter}`
      const own = await request(tokens[1 - actor], path)
      assert(own.ok && own.data.length === 1, `Owner must see its ${table} fixture.`)
      const read = await request(tokens[actor], path)
      assert(read.ok && Array.isArray(read.data) && read.data.length === 0, `Foreign ${table} row was visible or read check unavailable.`)
      const patchField = table === 'courses' ? 'name' : table === 'materials' ? 'title' : table === 'material_chunks' ? 'content' : table === 'study_artifacts' ? 'payload' : table === 'conversation_threads' ? 'title' : table === 'conversation_messages' ? 'metadata' : table === 'learning_state' ? 'confidence' : table === 'concept_evidence' ? 'result' : 'answer'
      const changed = await request(tokens[actor], path, 'PATCH', { [patchField]: patchField === 'payload' ? { summary: 'Unauthorized' } : patchField === 'metadata' ? {} : patchField === 'confidence' ? 1 : patchField === 'result' ? 'good' : 'Unauthorized' })
      assert(!changed.ok || Array.isArray(changed.data) && changed.data.length === 0, `Foreign ${table} UPDATE succeeded.`)
      const deleted = await request(tokens[actor], path, 'DELETE')
      assert(!deleted.ok || Array.isArray(deleted.data) && deleted.data.length === 0, `Foreign ${table} DELETE succeeded.`)
      const after = await request(tokens[1 - actor], path)
      assert(after.ok && after.data.length === 1 && JSON.stringify(after.data[0][patchField]) === JSON.stringify(own.data[0][patchField]), `Foreign ${table} fixture changed.`)
      const forged = await request(tokens[actor], `/rest/v1/${table}`, 'POST', { ...row, ...(table === 'learning_state' ? {concept_key:'forged-concept'} : {id: table === 'courses' || table === 'materials' ? `forged-${randomUUID()}` : randomUUID()}) })
      assert(!forged.ok, `Foreign owner INSERT succeeded in ${table}.`)
      console.log(`PASS ${actor === 0 ? 'A → B' : 'B → A'} ${table}: SELECT/INSERT/UPDATE/DELETE`)
    }
    const search = await request(tokens[actor], `/rest/v1/conversation_threads?title=ilike.*${run}*&user_id=eq.${other.userId}`)
    assert(search.ok && search.data.length === 0, 'Foreign title search leaked a thread.')
    const scope = {id:randomUUID(),title:'Forged relation',scope:'material',workspace_id:null,course_id:other.courseId,material_id:other.materialId}
    const append = await request(tokens[actor], '/rest/v1/rpc/append_conversation_message', 'POST', {p_thread:scope,p_message:{id:randomUUID(),role:'user',content:'Foreign context',metadata:{}}})
    assert(!append.ok, 'RPC accepted foreign course/material ownership.')
    const evidenceRpc = await request(tokens[actor], '/rest/v1/rpc/record_concept_evidence','POST',{p_evidence:{...other.rows.concept_evidence,id:randomUUID(),source_id:randomUUID()}})
    assert(!evidenceRpc.ok, 'Evidence RPC accepted foreign context.')
    const reset = await request(tokens[actor], '/rest/v1/rpc/reset_course_learning_memory','POST',{p_course_id:other.courseId})
    assert(!reset.ok, 'Reset RPC erased foreign memory.')
    console.log(`PASS ${actor === 0 ? 'A → B' : 'B → A'} conversation title search and graph RPC ownership`)
    for(const [rpc,args] of [['commit_source_document',{p_course_id:other.courseId,p_material_id:other.sourceId,p_expected_revision:2,p_document:{}}],['rename_source_material',{p_course_id:other.courseId,p_material_id:other.sourceId,p_expected_revision:2,p_title:'Forged'}],['begin_academic_cleanup',{p_course_id:other.courseId,p_material_id:other.sourceId}]]) assert(!(await request(tokens[actor],`/rest/v1/rpc/${rpc}`,'POST',args)).ok,`Foreign ${rpc} must be denied.`)
    for (const file of fixtureFiles) {
      const object = objectPath(file.bucket, other[file.field])
      const ownDownload = await request(tokens[1 - actor], `/storage/v1/object/authenticated/${object}`)
      assert(ownDownload.ok, `Owner cannot download ${file.bucket} fixture.`)
      const foreignDownload = await request(tokens[actor], `/storage/v1/object/authenticated/${object}`)
      assert(!foreignDownload.ok, `Foreign ${file.bucket} download succeeded.`)
      const foreignSign = await request(tokens[actor], `/storage/v1/object/sign/${object}`, 'POST', { expiresIn: 60 })
      assert(!foreignSign.ok, `Foreign ${file.bucket} signed URL creation succeeded.`)
      const ownSign = await request(tokens[1 - actor], `/storage/v1/object/sign/${object}`, 'POST', { expiresIn: 60 })
      assert(ownSign.ok && ownSign.data.signedURL, `Owner signing failed for ${file.bucket}.`)
      const signedPath = ownSign.data.signedURL
      const signedUrl = signedPath.startsWith('http') ? signedPath : signedPath.startsWith('/storage/v1/') ? `${base}${signedPath}` : `${base}/storage/v1${signedPath.startsWith('/') ? '' : '/'}${signedPath}`
      const signed = await fetch(signedUrl)
      assert(signed.ok, `Owner signed URL cannot download ${file.bucket}.`)
      const publicDownload = await fetch(`${base}/storage/v1/object/public/${object}`)
      assert(!publicDownload.ok, `${file.bucket} is publicly downloadable.`)
      const foreignTarget = file.bucket === 'study-sources' ? `${other.userId}/${other.courseId}/${other.sourceId}/forged.txt` : file.bucket === 'study-pdfs' ? `${other.userId}/${other.courseId}/${other.uploadMaterialId}/original.pdf` : file.bucket === 'conversation-images' ? `${other.userId}/${other.threadId}/${other.messageId}/1.png` : `${other.userId}/${other.courseId}/solutions/${other.solutionId}/forged.png`
      const forged = await request(tokens[actor], `/storage/v1/object/${objectPath(file.bucket, foreignTarget)}`, 'POST', file.bytes, file.mime)
      assert(!forged.ok, `Foreign ${file.bucket} upload succeeded.`)
      await request(tokens[actor], `/storage/v1/object/${file.bucket}`, 'DELETE', { prefixes: [other[file.field]] })
      assert((await request(tokens[1 - actor], `/storage/v1/object/authenticated/${object}`)).ok, `Foreign ${file.bucket} delete removed the object.`)
      console.log(`PASS ${actor === 0 ? 'A → B' : 'B → A'} ${file.bucket}: private download/sign/upload/delete`)
    }
  }
  for (const [index,fixture] of fixtures.entries()) {
    const prepared=await request(tokens[index],'/rest/v1/rpc/begin_academic_cleanup','POST',{p_course_id:fixture.courseId,p_material_id:fixture.sourceId})
    assert(prepared.ok && prepared.data?.manifest?.some(entry => entry.bucket==='study-sources' && entry.path===fixture.sourceText),'Cleanup must capture the original before metadata deletion.')
    const job=prepared.data
    assert(!(await request(tokens[index],'/rest/v1/rpc/finish_academic_cleanup','POST',{p_job_id:job.id})).ok,'Finalization must fail while the original exists.')
    assert(!(await request(tokens[index],`/storage/v1/object/${objectPath('study-sources',fixture.sourceText.replace('original.txt','late.txt'))}`,'POST',Buffer.from('Late write'),'text/plain')).ok,'Late uploads during cleanup must fail.')
    const foreignJob=await request(tokens[1-index],`/rest/v1/academic_cleanup_jobs?id=eq.${job.id}`)
    assert(foreignJob.ok && foreignJob.data.length===0,'Cleanup jobs are private.')
    for (const bucket of new Set(job.manifest.map(entry => entry.bucket))) {
      const paths=job.manifest.filter(entry => entry.bucket===bucket).map(entry => entry.path)
      assert(paths.every(path => path.startsWith(`${fixture.userId}/${fixture.courseId}/`)),'Unexpected fixture cleanup path.')
      assert((await request(tokens[index],`/storage/v1/object/${bucket}`,'DELETE',{prefixes:paths})).ok,'Owner cleanup must remove the original.')
    }
    assert((await request(tokens[index],'/rest/v1/rpc/finish_academic_cleanup','POST',{p_job_id:job.id})).ok,'Cleanup finalization must succeed after Storage.')
    assert((await request(tokens[index],'/rest/v1/rpc/finish_academic_cleanup','POST',{p_job_id:job.id})).ok,'Finalization is idempotent.')
    console.log(`PASS owner ${index===0?'A':'B'} normalized source, private queue and blobs-before-metadata cleanup`)
  }
  passed = true
  console.log('PASS: two-user academic isolation checks completed against the configured project.')
} finally {
  let clean = true
  for (const [index, fixture] of fixtures.entries()) {
    for (const file of fixtureFiles) {
      const foreignTarget = file.bucket === 'study-sources' ? `${fixture.userId}/${fixture.courseId}/${fixture.sourceId}/forged.txt` : file.bucket === 'study-pdfs' ? `${fixture.userId}/${fixture.courseId}/${fixture.uploadMaterialId}/original.pdf` : file.bucket === 'conversation-images' ? `${fixture.userId}/${fixture.threadId}/${fixture.messageId}/1.png` : `${fixture.userId}/${fixture.courseId}/solutions/${fixture.solutionId}/forged.png`
      const result = await request(tokens[index], `/storage/v1/object/${file.bucket}`, 'DELETE', { prefixes: [fixture[file.field], foreignTarget] }).catch(() => ({ ok: false }))
      if (!result.ok) clean = false
    }
    const result = await request(tokens[index], `/rest/v1/courses?user_id=eq.${fixture.userId}&id=eq.${encodeURIComponent(fixture.courseId)}`, 'DELETE').catch(() => ({ ok: false }))
    if (!result.ok) clean = false
  }
  if (!clean) { console.error(`Cleanup incomplete. Remove only fixtures starting security-${run}; use the owning accounts. Run status: ${passed ? 'passed' : 'failed'}.`); process.exitCode = 1 }
}
