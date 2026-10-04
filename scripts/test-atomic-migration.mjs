// Regression coverage for SQL Editor recovery: actual PostgreSQL, never production.
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile, readdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { PGlite } from '../node_modules/.cache/nexo-sql-runtime/node_modules/@electric-sql/pglite/dist/index.js'

const names = (await readdir(new URL('../sql/', import.meta.url))).filter(name => /^\d+.*\.sql$/.test(name))
const migrations = Object.fromEntries(await Promise.all(names.map(async name => [name.slice(0, 3), await readFile(new URL(`../sql/${name}`, import.meta.url), 'utf8')])))
const recovery = async () => readFile(new URL('../sql/014_atomic_source_recovery.sql', import.meta.url), 'utf8')

async function fixture({ partial008 = false, through010 = false } = {}) {
  const db = new PGlite(), a = randomUUID(), b = randomUUID()
  const q = (statement, params = []) => db.query(statement, params)
  const row = async (statement, params = []) => (await q(statement, params)).rows[0]
  const actor = async id => {
    await db.exec('reset role; set role authenticated;')
    await q("select set_config('request.jwt.claim.sub',$1,false)", [id])
  }
  await db.exec(`create role authenticated; create role anon; create schema auth; create schema storage;
    create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[],owner_id text);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,
      owner uuid,owner_id text,metadata jsonb,version text,created_at timestamptz default now(),updated_at timestamptz default now(),unique(bucket_id,name));
    alter table storage.objects enable row level security;
    create function storage.foldername(text) returns text[] language sql immutable as $$ select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1] $$;
    create function storage.filename(text) returns text language sql immutable as $$ select (string_to_array($1,'/'))[array_length(string_to_array($1,'/'),1)] $$;
    grant usage on schema public,auth,storage to authenticated,anon;
    grant execute on function auth.uid(),storage.foldername(text),storage.filename(text) to authenticated;
    grant select,insert,update,delete on storage.objects to authenticated;
    grant select on storage.buckets to authenticated;
    alter default privileges in schema public grant execute on functions to anon,authenticated;`)
  for (const number of ['001', '002', '003', '004', '005', '006', '007']) {
    if (number === '006') await q('insert into auth.users(id,raw_user_meta_data) values($1,$2),($3,$4)', [a, { username: 'sebasshulla' }, b, { username: 'user_b' }])
    await db.exec(migrations[number])
  }
  if (partial008) await db.exec("alter table public.materials add column document_kind text not null default 'unknown'")
  await db.exec(migrations['009'])
  if (through010) await db.exec(migrations['010'])
  return { db, a, b, q, row, actor }
}

async function verify(f) {
  const columns = (await f.q("select column_name,data_type from information_schema.columns where table_schema='public' and table_name='materials' and column_name in ('document_kind','analysis_status','analyzed_pages') order by column_name")).rows
  assert.equal(columns.length, 3)
  assert.equal((await f.row("select public from storage.buckets where id='study-sources'")).public, false)
  assert.equal((await f.row("select to_regprocedure('public.commit_source_document(text,text,integer,jsonb)') is not null as ok")).ok, true)
  assert.equal((await f.row("select obj_description('public.academic_blob_manifest(uuid,text,text)'::regprocedure,'pg_proc') as marker")).marker, 'Nexo014 atomic source recovery; owner/course/material use positional SQL arguments.')
  assert.equal((await f.row("select count(*)::integer as n from pg_policies where schemaname='storage' and policyname in ('study_sources_owner_select','study_sources_owner_write','study_sources_owner_update','study_sources_owner_delete')")).n, 4)
  assert.equal((await f.row("select count(*)::integer as n from pg_class where relname in ('nexo_012_context_columns','nexo_012_context_fks')")).n, 0)
}

function injectLateFailure(statement) {
  const opening = /^\s*do\s+(\$[a-zA-Z0-9_]*\$)/im.exec(statement)
  assert(opening, 'recovery must have one top-level anonymous block')
  const close = statement.lastIndexOf(opening[1])
  const prefix = statement.slice(0, close)
  assert(/\bend\s*;?\s*$/i.test(prefix), 'outer block must end immediately before its closing dollar tag')
  return prefix.replace(/\bend\s*;?\s*$/i, "raise exception 'injected final recovery failure' using errcode='P0001';\nend;\n") + statement.slice(close)
}

test('013 exact temporary snapshot loses its relation after an autocommitted statement', async () => {
  const f = await fixture({ through010: true })
  try {
    const old = migrations['013']
    const from = old.indexOf('create temporary table nexo_012_context_columns')
    const until = old.indexOf('do $$ declare col record;', from)
    assert(from > 0 && until > from)
    // query executes only this CREATE statement; its implicit transaction commits.
    await f.q(old.slice(from, until).trim())
    await assert.rejects(f.q('select * from nexo_012_context_columns'), error => error.code === '42P01')
    assert.equal((await f.row("select to_regclass('pg_temp.nexo_012_context_columns') is null as gone")).gone, true)
  } finally { await f.db.close() }
})

test('014 installs as one db.query statement with hostile caller search_path', async () => {
  const f = await fixture()
  try {
    await f.db.exec('set search_path=storage,pg_catalog')
    await f.q(await recovery())
    await verify(f)
    assert.equal((await f.row('show search_path')).search_path, 'storage, pg_catalog', 'migration configuration is transaction-local')
    await f.q(await recovery())
    await verify(f)
  } finally { await f.db.close() }
})

test('014 also repeats inside an explicit transaction supplied by its caller', async () => {
  const f = await fixture({ partial008: true })
  try {
    await f.q('begin')
    await f.q(await recovery())
    await f.q('commit')
    await verify(f)
    const before = (await f.q("select conrelid,conname,pg_get_constraintdef(oid) definition from pg_constraint where connamespace='public'::regnamespace order by conrelid,conname")).rows
    await f.q('begin')
    await f.q(await recovery())
    await f.q('commit')
    await verify(f)
    assert.deepEqual((await f.q("select conrelid,conname,pg_get_constraintdef(oid) definition from pg_constraint where connamespace='public'::regnamespace order by conrelid,conname")).rows, before)
  } finally { await f.db.close() }
})

test('014 revokes explicit Supabase default grants on private helpers and retains checked RPC access', async () => {
  const f = await fixture()
  try {
    await f.q(await recovery())
    const internal = ['touch_conversation_thread()',
      'recompute_concept_state(uuid,text,text)', 'evidence_updates_state()', 'academic_blob_manifest(uuid,text,text)',
      'guard_academic_delete()', 'guard_academic_write()', 'guard_cleanup_storage_write()', 'guard_cleanup_conversation_write()']
    for (const role of ['anon', 'authenticated']) for (const signature of internal) {
      assert.equal((await f.row('select has_function_privilege($1,$2,\'execute\') as allowed', [role, `public.${signature}`])).allowed, false, `${role} must not execute private ${signature}`)
    }
    for (const signature of ['append_conversation_message(jsonb,jsonb)', 'record_concept_evidence(jsonb)',
      'begin_academic_cleanup(text,text)', 'finish_academic_cleanup(uuid)', 'commit_source_document(text,text,integer,jsonb)']) {
      assert.equal((await f.row('select has_function_privilege(\'authenticated\',$1,\'execute\') as allowed', [`public.${signature}`])).allowed, true, `checked RPC ${signature} retains authenticated access`)
    }
  } finally { await f.db.close() }
})

test('014 late failure rolls back columns, functions, private bucket and policies without caller rollback', async () => {
  const f = await fixture()
  try {
    await f.q("insert into public.courses(user_id,id,name) values($1,'retained-course','Curso conservado')", [f.a])
    await f.q("insert into public.materials(user_id,course_id,id,title,content) values($1,'retained-course','retained-material','Texto conservado','Contenido original')", [f.a])
    const material = await f.row("select * from public.materials where id='retained-material'")
    const functions = (await f.q("select oid,proname,prosrc from pg_proc where pronamespace='public'::regnamespace order by oid")).rows
    const policies = (await f.q('select * from pg_policies order by schemaname,tablename,policyname')).rows
    await assert.rejects(f.q(injectLateFailure(await recovery())), error => error.code === 'P0001' && /injected final/.test(error.message))
    // Intentionally no ROLLBACK: the single failed DO must have reverted itself.
    assert.equal((await f.row("select count(*)::integer as n from information_schema.columns where table_schema='public' and table_name='materials' and column_name in ('document_kind','analysis_status','analyzed_pages')")).n, 0)
    assert.equal(await f.row("select id from storage.buckets where id='study-sources'"), undefined)
    assert.equal((await f.row("select to_regclass('public.academic_cleanup_jobs') is null as absent")).absent, true)
    assert.equal((await f.row("select count(*)::integer as n from pg_description where description like 'Nexo014 atomic source recovery;%'")).n, 0, 'completion marker cannot survive a failed recovery')
    assert.deepEqual(await f.row("select * from public.materials where id='retained-material'"), material)
    assert.deepEqual((await f.q("select oid,proname,prosrc from pg_proc where pronamespace='public'::regnamespace order by oid")).rows, functions)
    assert.deepEqual((await f.q('select * from pg_policies order by schemaname,tablename,policyname')).rows, policies)
    await f.q(await recovery())
    await verify(f)
  } finally { await f.db.close() }
})

test('014 preserves partial persisted 013 inventory, originals and Storage owner_id text', async () => {
  const f = await fixture({ partial008: true, through010: true })
  try {
    const course = randomUUID(), material = randomUUID(), thread = randomUUID(), message = randomUUID()
    await f.actor(f.a)
    await f.q('insert into public.courses(user_id,id,name) values($1,$2,$3)', [f.a, course, 'Curso original'])
    await f.q("insert into public.materials(user_id,course_id,id,title,content,source_type,document_kind,metadata) values($1,$2,$3,'PDF original','Contenido original','pdf','scan','{\"sourceRevision\":7}')", [f.a, course, material])
    const pack = { id: thread, workspace_id: null, course_id: course, material_id: material, title: 'Chat original', scope: 'material' }
    await f.q('select public.append_conversation_message($1,$2)', [pack, { id: message, role: 'user', content: 'Mensaje conservado', metadata: {} }])
    await f.db.exec('reset role')
    // Simulate committed instructions from 013 before the missing temp relation.
    const first = migrations['013'].slice(migrations['013'].indexOf('-- Complete 008'), migrations['013'].indexOf('-- 010 uses CREATE TABLE'))
    await f.db.exec(first)
    const cleanup = migrations['013'].slice(migrations['013'].indexOf('create table if not exists public.academic_cleanup_jobs'), migrations['013'].indexOf('-- Only existing owned materials accept originals'))
    await f.db.exec(cleanup)
    const pending = randomUUID()
    await f.q("insert into public.academic_cleanup_jobs(id,user_id,course_id,material_id,status,manifest,last_error) values($1,$2,'historical-deleted-course',null,'complete','[]','Retained historical state')", [pending, f.a])
    const pdf = `${f.a}/${course}/${material}/original.pdf`, image = `${f.a}/${thread}/${message}/0.png`
    const foreign = `${f.b}/${course}/${material}/original.pdf`
    await f.q('update public.materials set storage_path=$1 where id=$2', [pdf, material])
    await f.q('insert into storage.objects(bucket_id,name,owner_id) values($1,$2,$3),($4,$5,$6),($7,$8,$9)', ['study-pdfs', pdf, f.b, 'conversation-images', image, 'external-non-uuid', 'study-pdfs', foreign, f.a])
    const oldMaterial = await f.row('select * from public.materials where id=$1', [material])
    const oldMessage = await f.row('select * from public.conversation_messages where id=$1', [message])
    const oldJobs = (await f.q('select * from public.academic_cleanup_jobs order by id')).rows
    const originals = (await f.q('select * from storage.objects order by id')).rows
    await f.db.exec('set search_path=storage,pg_catalog')
    await f.q(await recovery())
    await f.q(await recovery())
    await verify(f)
    assert.deepEqual(await f.row('select * from public.materials where id=$1', [material]), oldMaterial)
    assert.deepEqual(await f.row('select * from public.conversation_messages where id=$1', [message]), oldMessage)
    assert.deepEqual((await f.q('select * from public.academic_cleanup_jobs order by id')).rows, oldJobs)
    assert.deepEqual((await f.q('select * from storage.objects order by id')).rows, originals)
    const manifest = (await f.row('select public.academic_blob_manifest($1,$2,$3) value', [f.a, course, material])).value
    assert.deepEqual(manifest.map(item => item.path).sort(), [pdf, image].sort(), 'function parameters never resolve to Storage owner_id columns')
    await f.actor(f.b)
    assert.equal((await f.row('select count(*)::integer as n from public.materials')).n, 0)
    assert.equal((await f.row('select count(*)::integer as n from public.conversation_messages')).n, 0)
    assert.deepEqual((await f.q('select name from storage.objects')).rows, [{ name: foreign }], 'B sees only their own stored path')
    await assert.rejects(f.q('select public.academic_blob_manifest($1,$2,$3)', [f.a, course, material]))
  } finally { await f.db.close() }
})
