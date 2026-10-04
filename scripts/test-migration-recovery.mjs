// Actual PostgreSQL via the existing isolated PGlite runtime. Never connects to production.
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile, readdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { PGlite } from '../node_modules/.cache/nexo-sql-runtime/node_modules/@electric-sql/pglite/dist/index.js'

const files = (await readdir(new URL('../sql/',import.meta.url))).filter(n => /^\d+.*\.sql$/.test(n)).sort()
const sql = Object.fromEntries(await Promise.all(files.map(async name => [name.slice(0,3),await readFile(new URL(`../sql/${name}`,import.meta.url),'utf8')])))
const diagnostics=await readFile(new URL('../sql/diagnostics/verify_013_recovery.sql',import.meta.url),'utf8')
const columns = [
  "document_kind text not null default 'unknown' check(document_kind in ('text','scan','mixed','unknown'))",
  "analysis_status text not null default 'not_started' check(analysis_status in ('not_started','reading','indexing','ready','partial','failed'))",
  "analyzed_pages integer[] not null default '{}' check(array_position(analyzed_pages,null) is null)"
]
async function fixture(mask=1, through010=true) {
  const db = new PGlite(), a=randomUUID(), b=randomUUID()
  const q = (statement,params=[]) => db.query(statement,params)
  const row = async (statement,params=[]) => (await q(statement,params)).rows[0]
  const actor = async id => { await db.exec('reset role; set role authenticated;'); await q("select set_config('request.jwt.claim.sub',$1,false)",[id]) }
  const migration = async number => { await db.exec('reset role'); await db.exec(sql[number]) }
  const failure = async (statement,code) => {
    let caught
    try { await db.exec(statement) } catch(error) { caught=error } finally { await db.exec('rollback') }
    assert(caught,'expected PostgreSQL error')
    if (code) assert.equal(caught.code,code,caught.message)
    return caught
  }
  const denied = async (statement,params=[]) => { await assert.rejects(q(statement,params)) }
  await db.exec(`create role authenticated; create role anon; create schema auth; create schema storage;
    create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[],owner_id text);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,
      owner uuid,owner_id text,metadata jsonb,version text,created_at timestamptz default now(),updated_at timestamptz default now(),
      unique(bucket_id,name));
    alter table storage.objects enable row level security;
    create function storage.foldername(text) returns text[] language sql immutable as $$ select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1] $$;
    create function storage.filename(text) returns text language sql immutable as $$ select (string_to_array($1,'/'))[array_length(string_to_array($1,'/'),1)] $$;
    grant usage on schema public,auth,storage to authenticated,anon;
    grant execute on function auth.uid(),storage.foldername(text),storage.filename(text) to authenticated;
    grant select,insert,update,delete on storage.objects to authenticated; grant select on storage.buckets to authenticated;`)
  for (const n of ['001','002','003','004','005','006','007']) {
    if (n==='006') await q('insert into auth.users(id,raw_user_meta_data) values($1,$2),($3,$4)',[a,{username:'sebasshulla'},b,{username:'user_b'}])
    await migration(n)
  }
  for (let bit=0;bit<3;bit++) if (mask & 1<<bit) await db.exec(`alter table materials add column ${columns[bit]}`)
  await migration('009')
  if (through010) await migration('010')
  return {db,a,b,q,row,actor,migration,failure,denied}
}

// Reproduce a legacy schema that CREATE TABLE IF NOT EXISTS leaves unchanged.
// Academic parent keys remain text, while conversation/evidence context uses UUID.
const drift = `do $$ declare k record; t text; c text; begin
  for k in select conrelid,conname from pg_constraint where contype='f' and
    exists(select 1 from pg_attribute a where a.attname in ('course_id','material_id') and
      a.attrelid in ('conversation_threads'::regclass,'concept_evidence'::regclass) and
      ((conrelid=a.attrelid and a.attnum=any(conkey)) or (confrelid=a.attrelid and a.attnum=any(confkey)))) loop
    execute format('alter table %s drop constraint %I',k.conrelid::regclass,k.conname);
  end loop;
  foreach t in array array['conversation_threads','concept_evidence'] loop
    foreach c in array array['course_id','material_id'] loop
      execute format('alter table %I alter column %I type uuid using %I::uuid',t,c,c);
    end loop;
  end loop;
end $$;
alter table concept_evidence add constraint legacy_evidence_thread foreign key(user_id,course_id,thread_id)
  references conversation_threads(user_id,course_id,id) on delete cascade;`

async function seed(f,withEvidence=true) {
  const course=randomUUID(), material=randomUUID(), thread=randomUUID(), message=randomUUID()
  await f.actor(f.a)
  await f.q('insert into courses(user_id,id,name) values($1,$2,$3)',[f.a,course,'Curso conservado'])
  await f.q('insert into materials(user_id,course_id,id,title,content,source_type) values($1,$2,$3,$4,$5,$6)',[f.a,course,material,'PDF conservado','Movimiento horizontal constante.','pdf'])
  if (await f.row("select 1 from information_schema.columns where table_name='materials' and column_name='document_kind'"))
    await f.q("update materials set document_kind='scan' where id=$1",[material])
  const pack={id:thread,workspace_id:null,course_id:course,material_id:material,title:'Conversación conservada',scope:'material'}
  const msg={id:message,role:'user',content:'Mensaje original',metadata:{}}
  await f.q('select append_conversation_message($1,$2)',[pack,msg])
  if (withEvidence) {
    await f.q("insert into learning_state(user_id,course_id,material_id,concept_key,concept_label,status,confidence,attempts,correct_attempts) values($1,$2,$3,'horizontal','Horizontal','known',.7,3,2)",[f.a,course,material])
    await f.q('select record_concept_evidence($1)',[{id:randomUUID(),course_id:course,material_id:material,concept_key:'horizontal',concept_label:'Horizontal',source_type:'quiz',source_id:'old-practice',result:'good'}])
  }
  const pdf=`${f.a}/${course}/${material}/original.pdf`, image=`${f.a}/${thread}/${message}/0.png`
  await f.q('update materials set storage_path=$1 where id=$2',[pdf,material])
  await f.q('update conversation_messages set metadata=$1 where id=$2',[{attachments:[{storagePath:image,mimeType:'image/png',name:'Original.png',bytes:10}]},message])
  await f.q('insert into storage.objects(bucket_id,name) values($1,$2),($3,$4)',['study-pdfs',pdf,'conversation-images',image])
  await f.db.exec('reset role')
  return {course,material,thread,message,pack,msg,pdf,image}
}

test('012 embeds unchanged 010/011 bodies under one transaction', () => {
  for(const n of ['010','011']) {
    const body=sql[n].replace(/\r\n/g,'\n').replace(/^begin;\s*$/m,'').replace(/^commit;\s*$/m,'').trim()
    assert(sql['012'].includes(body),`snapshot ${n} must preserve the audited implementation`)
  }
  assert.equal((sql['012'].match(/^begin;$/gm)||[]).length,1)
  assert.equal((sql['012'].match(/^commit;$/gm)||[]).length,1)
  assert(!/drop\s+(table|column)|disable\s+trigger|check_function_bodies\s*=\s*(off|false)/i.test(sql['012']))
})

test('013 preserves the 012 transaction except manifest bindings and recovery labels', () => {
  const normalize=value=>value.slice(value.indexOf('begin;'),value.lastIndexOf('commit;')+7)
    .replace(/^create or replace function public\.academic_blob_manifest\(owner_id uuid,course_key text,material_key text\)\r?\n[\s\S]+?\$\$;/m,'MANIFEST_FUNCTION')
    .replaceAll("'013:","'012:").split(/\r?\n/).map(line=>line.trim()).filter(line=>line && !line.startsWith('--')).join('\n')
  assert.equal(normalize(sql['013']),normalize(sql['012']))
  assert.equal((sql['013'].match(/^begin;$/gm)||[]).length,1)
  assert.equal((sql['013'].match(/^commit;$/gm)||[]).length,1)
})

test('Storage owner_id text reproduces the real 012 error with already-correct course keys',async () => {
  const f=await fixture(0)
  try {
    await f.migration('008')
    const old=await seed(f)
    const baseline=await f.row('select attempts,correct_attempts,confidence,legacy_baseline,evidence_count from learning_state')
    // Metadata ownership may be null, another UUID or a non-UUID identity. None
    // of those values may substitute the function's UUID owner parameter.
    await f.q('update storage.objects set owner_id=$1 where name=$2',[f.b,old.pdf])
    await f.q("update storage.objects set owner_id='external-non-uuid' where name=$1",[old.image])
    const foreignPath=`${f.b}/${old.course}/${old.material}/original.pdf`
    await f.q('insert into storage.objects(bucket_id,name,owner_id) values($1,$2,$3)',['study-pdfs',foreignPath,f.a])
    const types=(await f.q("select data_type from information_schema.columns where table_name='conversation_threads' and column_name in ('course_id','material_id')")).rows
    assert.equal(types.length,2); assert(types.every(r=>r.data_type==='text'))
    const error=await f.failure(sql['012'],'42883')
    assert.match(error.message,/uuid = text/)
    console.log('REPRODUCED: original 012 fails with storage.objects.owner_id text, even with text course/material keys.')
    await f.migration('013'); await f.migration('013')
    assert.equal((await f.db.exec(diagnostics)).at(-1).rows[0].status,'OK')
    const manifest=(await f.row('select academic_blob_manifest($1,$2,$3) value',[f.a,old.course,old.material])).value
    assert.deepEqual(manifest.map(x=>x.path).sort(),[old.pdf,old.image].sort(),'uses the passed owner, never Storage owner_id')
    assert.deepEqual(await f.row('select attempts,correct_attempts,confidence,legacy_baseline,evidence_count from learning_state'),baseline)
    assert.equal((await f.row('select owner_id from storage.objects where name=$1',[old.image])).owner_id,'external-non-uuid','no Storage schema/data rewrite')
    await f.actor(f.a)
    await f.denied('select academic_blob_manifest($1,$2,$3)',[f.a,old.course,old.material])
    const job=(await f.row('select begin_academic_cleanup($1,$2) value',[old.course,old.material])).value
    assert.deepEqual(job.manifest.map(x=>x.path).sort(),[old.pdf,old.image].sort())
    await f.denied('select finish_academic_cleanup($1)',[job.id])
  } finally { await f.db.close() }
})

test('013 also repairs partial 008/legacy UUID context, preserves data, protects A/B and cleanup',async () => {
  const f=await fixture()
  try {
    const duplicate=await f.failure(sql['008'],'42701')
    assert.match(duplicate.message,/document_kind.*already exists/)
    const old=await seed(f)
    const baseline=await f.row('select attempts,correct_attempts,confidence,legacy_baseline,evidence_count from learning_state')
    await f.db.exec(drift)
    const mismatch=await f.failure(sql['011'],'42883')
    assert.match(mismatch.message,/uuid = text/)
    assert.equal(await f.row("select id from storage.buckets where id='study-sources'"),undefined,'failed 011 rolls back')
    await f.migration('013')
    const verification=await f.db.exec(diagnostics)
    assert(verification[1].rows.every(r=>r.status==='OK'))
    assert.equal(verification[2].rows.length,4); assert(verification[2].rows.every(r=>r.is_public===false))
    assert.equal(verification[3].rows.length,5); assert(verification[3].rows.every(r=>r.rls_enabled===true))
    assert.equal(verification.at(-1).rows[0].status,'OK')
    const types=(await f.q("select table_name,column_name,data_type from information_schema.columns where table_schema='public' and table_name in ('conversation_threads','concept_evidence') and column_name in ('course_id','material_id')")).rows
    assert.equal(types.length,4); assert(types.every(c=>c.data_type==='text'))
    for(const col of ['user_id','id','workspace_id']) assert.equal((await f.row('select data_type from information_schema.columns where table_name=$1 and column_name=$2',['conversation_threads',col])).data_type,'uuid')
    assert.equal((await f.row('select course_id,material_id from conversation_threads where id=$1',[old.thread])).course_id,old.course)
    assert.equal((await f.row('select content from conversation_messages where id=$1',[old.message])).content,'Mensaje original')
    assert.equal((await f.row('select document_kind,analysis_status from materials where id=$1',[old.material])).document_kind,'scan')
    assert.equal((await f.row('select analysis_status from materials where id=$1',[old.material])).analysis_status,'ready')
    assert.deepEqual(await f.row('select attempts,correct_attempts,confidence,legacy_baseline,evidence_count from learning_state'),baseline)
    assert.equal(Number((await f.row('select count(*) n from storage.objects')).n),2)
    assert((await f.row("select 1 from pg_constraint where conname='legacy_evidence_thread' and convalidated")),'inbound FK retained and validated')
    const constraintCount=(await f.row('select count(*) n from pg_constraint')).n
    await f.migration('013')
    assert.equal((await f.row('select count(*) n from pg_constraint')).n,constraintCount,'no duplicate constraints on repeat')
    assert.deepEqual(await f.row('select attempts,correct_attempts,confidence,legacy_baseline,evidence_count from learning_state'),baseline)
    await f.actor(f.a)
    await f.q('update materials set page_count=320 where id=$1',[old.material])
    await f.q("insert into courses(user_id,id,name) values($1,'course-text','Curso nuevo')",[f.a])
    await f.q("insert into materials(user_id,course_id,id,title,source_type) values($1,'course-text','material-text','Apunte','note')",[f.a])
    const newThread={...old.pack,id:randomUUID(),course_id:'course-text',material_id:'material-text'}
    await f.q('select append_conversation_message($1,$2)',[newThread,{...old.msg,id:randomUUID()}])
    await f.q('select append_conversation_message($1,$2)',[{...newThread,id:randomUUID(),course_id:null,material_id:null,scope:'general'},{...old.msg,id:randomUUID()}])
    const normalized={title:'Apunte actualizado',text:'La velocidad horizontal permanece constante.',pages:[{page:1,text:'La velocidad horizontal permanece constante.'}],metadata:{sourceRevision:1,source:{units:[{page:1}]}},analysis_status:'ready',chunks:[{id:randomUUID(),pageStart:1,pageEnd:1,text:'La velocidad horizontal permanece constante.',keywords:['horizontal']}],topics:[]}
    await f.q("select commit_source_document('course-text','material-text',0,$1)",[normalized])
    assert.equal((await f.q("select * from search_material_chunks_v2('course-text','horizontal')")).rows.length,1)
    await f.q('select record_concept_evidence($1)',[{id:randomUUID(),course_id:old.course,material_id:old.material,concept_key:'horizontal',concept_label:'Horizontal',source_type:'chat',source_id:old.message,result:'question',thread_id:old.thread,message_id:old.message}])
    assert.equal((await f.row('select attempts from learning_state where material_id=$1',[old.material])).attempts,baseline.attempts,'chat remains non-mastery evidence')
    await f.actor(f.b)
    assert.equal(Number((await f.row('select count(*) n from conversation_threads')).n),0)
    assert.equal(Number((await f.row('select count(*) n from storage.objects')).n),0)
    await f.denied('select begin_academic_cleanup($1,$2)',[old.course,old.material])
    await f.denied('select append_conversation_message($1,$2)',[{...old.pack,id:randomUUID()},{...old.msg,id:randomUUID()}])
    await f.actor(f.a)
    const job=(await f.row('select begin_academic_cleanup($1,$2) value',[old.course,old.material])).value
    assert.deepEqual(job.manifest.map(x=>x.path).sort(),[old.pdf,old.image].sort())
    await f.denied('select finish_academic_cleanup($1)',[job.id])
    await f.denied('select append_conversation_message($1,$2)',[{...old.pack,ensure_existing:true},{...old.msg,id:randomUUID()}])
    await f.q('delete from storage.objects where name=any($1::text[])',[[old.pdf,old.image]])
    await f.q('select finish_academic_cleanup($1)',[job.id])
    assert.equal(await f.row('select id from materials where id=$1',[old.material]),undefined)
    assert.equal(await f.row('select id from conversation_threads where id=$1',[old.thread]),undefined)
  } finally { await f.db.close() }
})

for(let mask=0;mask<8;mask++) test(`013: partial 008 combination ${mask.toString(2).padStart(3,'0')}, absent 010/011, repair and repeat`,async () => {
  const f=await fixture(mask,false)
  try {
    await f.q("insert into courses(user_id,id,name) values($1,'course-old','Curso')",[f.a])
    await f.q("insert into materials(user_id,course_id,id,title,content,metadata) values($1,'course-old','material-old','Texto','Contenido conservado', '{\"sourceRevision\":7}')",[f.a])
    if(mask&2) await f.q("update materials set analysis_status='partial' where id='material-old'")
    if(mask&4) await f.q("update materials set analyzed_pages='{1,2}' where id='material-old'")
    await f.migration('013'); await f.migration('013')
    const material=await f.row("select * from materials where id='material-old'")
    assert.equal(material.content,'Contenido conservado'); assert.equal(material.metadata.sourceRevision,7)
    assert.equal(material.analysis_status,mask&2?'partial':'ready')
    assert.deepEqual(material.analyzed_pages,mask&4?[1,2]:[])
    assert.equal((await f.row("select public from storage.buckets where id='study-sources'")).public,false)
    assert(await f.row("select to_regprocedure('public.commit_source_document(text,text,integer,jsonb)') is not null as ok").then(r=>r.ok))
    assert.equal((await f.q("select * from pg_constraint where conrelid='conversation_threads'::regclass and contype='f' and not convalidated")).rows.length,0)
  } finally { await f.db.close() }
})

test('already complete 013: preserve initialized analysis, revisions, originals and pending/completed jobs',async () => {
  const f=await fixture(0)
  try {
    await f.migration('008')
    await f.migration('013')
    const old=await seed(f)
    await f.actor(f.a)
    await f.q("update materials set analysis_status='partial',document_kind='mixed',analyzed_pages='{1,3}',metadata='{\"sourceRevision\":9}' where id=$1",[old.material])
    const pending=(await f.row('select begin_academic_cleanup($1,$2) value',[old.course,old.material])).value
    await f.q('select record_academic_cleanup_failure($1,$2)',[pending.id,'Retained failure'])
    await f.q("insert into courses(user_id,id,name) values($1,'course-complete','Terminada')",[f.a])
    const complete=(await f.row("select begin_academic_cleanup('course-complete',null) value")).value
    await f.q('select finish_academic_cleanup($1)',[complete.id])
    const before=await f.row('select content,metadata,analysis_status,document_kind,analyzed_pages,updated_at from materials where id=$1',[old.material])
    const jobs=(await f.q('select * from academic_cleanup_jobs order by id')).rows
    await f.migration('013'); await f.migration('013')
    assert.deepEqual(await f.row('select content,metadata,analysis_status,document_kind,analyzed_pages,updated_at from materials where id=$1',[old.material]),before)
    assert.deepEqual((await f.q('select * from academic_cleanup_jobs order by id')).rows,jobs)
    assert.equal(Number((await f.row('select count(*) n from storage.objects')).n),2)
    await f.actor(f.a)
    await f.denied("insert into courses(user_id,id,name) values($1,'course-complete','Resurrected')",[f.a])
  } finally { await f.db.close() }
})

test('orphan legacy context: fail and roll back instead of deleting or relinking data',async () => {
  const f=await fixture(1)
  try {
    const old=await seed(f,false)
    await f.db.exec(drift)
    await f.q('update conversation_threads set course_id=$1 where id=$2',[randomUUID(),old.thread])
    const before=await f.row('select * from conversation_threads where id=$1',[old.thread])
    await f.failure(sql['013'],'23503')
    assert.deepEqual(await f.row('select * from conversation_threads where id=$1',[old.thread]),before)
    assert.equal((await f.row("select data_type from information_schema.columns where table_name='conversation_threads' and column_name='course_id'")).data_type,'uuid')
    assert.equal(await f.row("select 1 from information_schema.columns where table_name='materials' and column_name='analysis_status'"),undefined)
    assert.equal(await f.row("select id from storage.buckets where id='study-sources'"),undefined)
    assert.equal(Number((await f.row('select count(*) n from storage.objects')).n),2)
  } finally { await f.db.close() }
})

test('unrecognized context type: explicit error and no partial changes',async () => {
  const f=await fixture(0,false)
  try {
    await f.db.exec('create table conversation_threads(id uuid primary key,user_id uuid,course_id integer,material_id text)')
    const error=await f.failure(sql['013'],'P0001')
    assert.match(error.message,/unsupported type integer/)
    assert.equal(await f.row("select 1 from information_schema.columns where table_name='materials' and column_name='document_kind'"),undefined)
    assert.equal(await f.row("select id from storage.buckets where id='study-sources'"),undefined)
  } finally { await f.db.close() }
})

test('013 repairs a previously installed 012 after Storage adds owner_id text',async () => {
  const f=await fixture(0)
  try {
    await f.migration('008')
    // Test-only simulation of the older minimal Storage model. The production
    // 013 migration never adds/drops/changes any Storage service column.
    await f.db.exec('alter table storage.objects drop column owner_id; alter table storage.buckets drop column owner_id')
    await f.migration('012')
    const old=await seed(f)
    const before=await f.row('select * from conversation_messages where id=$1',[old.message])
    await f.db.exec('alter table storage.objects add column owner_id text; alter table storage.buckets add column owner_id text')
    assert.equal((await f.db.exec(diagnostics)).at(-1).rows[0].status,'OUTDATED: run the complete 013 recovery')
    await assert.rejects(f.q('select academic_blob_manifest($1,$2,$3)',[f.a,old.course,old.material]),error=>error.code==='42883')
    await f.migration('013'); await f.migration('013')
    assert.deepEqual(await f.row('select * from conversation_messages where id=$1',[old.message]),before)
    const manifest=(await f.row('select academic_blob_manifest($1,$2,$3) value',[f.a,old.course,old.material])).value
    assert.deepEqual(manifest.map(x=>x.path).sort(),[old.pdf,old.image].sort())
    assert.equal((await f.db.exec(diagnostics)).at(-1).rows[0].status,'OK')
  } finally { await f.db.close() }
})
