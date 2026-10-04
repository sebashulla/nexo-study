-- Nexo Study V0.9.7 recovery: partial 008 + legacy UUID conversation context + failed 011.
-- Run this WHOLE file in Supabase SQL Editor after 001-007 and 009.
-- 008/010/011 may be absent, partial, or complete. Do not rerun 008 first.
-- Self-contained, repeatable, transactional. No row/object deletion; no CASCADE drops.
-- UUID owners, thread/message IDs and workspace IDs remain UUID. Academic keys are text.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '180s';
set local search_path = public, pg_temp;

-- Fail before changing anything if the underlying 007/009 model is different.
do $$
declare item record; actual_type oid;
begin
  for item in select * from (values
    ('courses','id'), ('materials','id'), ('materials','course_id'),
    ('material_chunks','material_id'), ('material_chunks','course_id'),
    ('material_topics','material_id'), ('material_topics','course_id'),
    ('study_artifacts','source_material_id'), ('study_artifacts','course_id'),
    ('study_progress','material_id'), ('study_progress','course_id'),
    ('learning_state','material_id'), ('learning_state','course_id'),
    ('study_sessions','course_id'), ('saved_solutions','course_id')
  ) as expected(table_name,column_name) loop
    select a.atttypid into actual_type from pg_attribute a
      where a.attrelid=to_regclass('public.'||item.table_name)
        and a.attname=item.column_name and not a.attisdropped;
    if actual_type is distinct from 'text'::regtype::oid then
      raise exception '012: public.%.% must be text (007/009). Found: %. No repair was committed.',
        item.table_name,item.column_name,coalesce(format_type(actual_type,null),'missing')
        using hint='Check that 001-007 and 009 are complete. Do not delete or recreate tables; inspect the schema first.';
    end if;
  end loop;
  if to_regclass('public.study_folders') is null then
    raise exception '012: study_folders is missing. Complete 004 before retrying.';
  end if;
end $$;

-- Prevent a writer from changing the schema/data between inspection and repair.
lock table public.courses, public.materials in share row exclusive mode;
do $$ declare t text; begin
  foreach t in array array['conversation_threads','conversation_messages','concept_evidence','academic_cleanup_jobs'] loop
    if to_regclass('public.'||t) is not null then
      execute format('lock table public.%I in share row exclusive mode',t);
    end if;
  end loop;
end $$;

-- Complete 008 without raising duplicate_column or replacing existing analysis.
alter table public.materials
  add column if not exists document_kind text not null default 'unknown',
  add column if not exists analysis_status text not null default 'not_started',
  add column if not exists analyzed_pages integer[] not null default '{}';

do $$ declare item record; actual_type oid; begin
  for item in select * from (values
    ('document_kind','text'::regtype::oid),('analysis_status','text'::regtype::oid),('analyzed_pages','integer[]'::regtype::oid)
  ) as expected(column_name,type_oid) loop
    select atttypid into actual_type from pg_attribute where attrelid='public.materials'::regclass
      and attname=item.column_name and not attisdropped;
    if actual_type is distinct from item.type_oid then
      raise exception '012: materials.% has an unexpected type: %. No repair was committed.',item.column_name,format_type(actual_type,null);
    end if;
  end loop;
end $$;
alter table public.materials
  alter column document_kind set default 'unknown', alter column document_kind set not null,
  alter column analysis_status set default 'not_started', alter column analysis_status set not null,
  alter column analyzed_pages set default '{}', alter column analyzed_pages set not null;

do $$ declare constraint_name text; begin
  for constraint_name in select conname from pg_constraint
    where conrelid='public.materials'::regclass and contype='c'
      and pg_get_constraintdef(oid) ilike '%page_count%' loop
    execute format('alter table public.materials drop constraint %I',constraint_name);
  end loop;
end $$;
alter table public.materials add constraint materials_page_count_nonnegative check(page_count is null or page_count>=0);
do $$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.materials'::regclass and conname='materials_document_kind_check') then
    alter table public.materials add constraint materials_document_kind_check check(document_kind in ('text','scan','mixed','unknown'));
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.materials'::regclass and conname='materials_analysis_status_check') then
    alter table public.materials add constraint materials_analysis_status_check check(analysis_status in ('not_started','reading','indexing','ready','partial','failed'));
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.materials'::regclass and conname='materials_analyzed_pages_check') then
    alter table public.materials add constraint materials_analyzed_pages_check check(array_position(analyzed_pages,null) is null);
  end if;
end $$;

-- Only default/uninitialized states are backfilled. Preserve scan/mixed, analyzed
-- pages, normalized content, revisions, evidence and rows frozen for deletion.
update public.materials set
  document_kind=case when document_kind='unknown' and (source_type='text' or content<>'') then 'text' else document_kind end,
  analysis_status=case processing_status when 'ready' then 'ready' when 'processing' then 'partial' when 'failed' then 'failed' else analysis_status end
where analysis_status='not_started' and processing_status in ('ready','processing','failed')
  and coalesce(metadata->>'deletionPending','false')<>'true';
comment on column public.materials.page_count is 'Physical PDF page count from pdf.numPages, independent of extracted text.';
comment on column public.materials.analyzed_pages is 'Physical page numbers inspected by the text extraction pipeline; blank pages are included.';
create or replace function public.nexo_search_normalize(value text)
returns text language sql immutable parallel safe as $$
  select translate(lower(coalesce(value,'')),'áéíóúüñ','aeiouun');
$$;
create index if not exists material_chunks_text_search_idx on public.material_chunks
  using gin(to_tsvector('simple',public.nexo_search_normalize(content)));

-- 010 uses CREATE TABLE IF NOT EXISTS: it cannot fix UUID context columns on an
-- already existing table. Convert ONLY academic context keys, preserving UUIDs
-- verbatim as text. Save and restore all affected FKs, including inbound ones.
create temporary table nexo_012_context_columns on commit drop as
select c.oid as table_oid,n.nspname as schema_name,c.relname as table_name,
  a.attnum,a.attname as column_name,a.atttypid,
  pg_get_expr(d.adbin,d.adrelid) as default_expression
from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
where n.nspname='public' and c.relname in ('conversation_threads','concept_evidence','academic_cleanup_jobs')
  and a.attname in ('course_id','material_id') and not a.attisdropped;
do $$ declare col record; begin
  for col in select * from nexo_012_context_columns loop
    if col.atttypid not in ('text'::regtype::oid,'uuid'::regtype::oid,'varchar'::regtype::oid) then
      raise exception '012: %.% has unsupported type %. No repair was committed.',col.table_name,col.column_name,format_type(col.atttypid,null);
    end if;
  end loop;
end $$;
create temporary table nexo_012_context_fks on commit drop as
select k.conrelid,k.conname,pg_get_constraintdef(k.oid) as definition
from pg_constraint k where k.contype='f' and exists(
  select 1 from nexo_012_context_columns a where a.atttypid<>'text'::regtype::oid and
    ((k.conrelid=a.table_oid and a.attnum=any(k.conkey)) or (k.confrelid=a.table_oid and a.attnum=any(k.confkey))));
do $$ declare fk record; col record; begin
  for fk in select * from nexo_012_context_fks loop
    execute format('alter table %s drop constraint %I',fk.conrelid::regclass,fk.conname);
  end loop;
  for col in select * from nexo_012_context_columns where atttypid<>'text'::regtype::oid loop
    execute format('alter table %I.%I alter column %I drop default',col.schema_name,col.table_name,col.column_name);
    execute format('alter table %I.%I alter column %I type text using %I::text',col.schema_name,col.table_name,col.column_name,col.column_name);
    if col.default_expression is not null then
      execute format('alter table %I.%I alter column %I set default (%s)::text',col.schema_name,col.table_name,col.column_name,col.default_expression);
    end if;
  end loop;
  for fk in select * from nexo_012_context_fks loop
    execute format('alter table %s add constraint %I %s',fk.conrelid::regclass,fk.conname,fk.definition);
  end loop;
end $$;

-- BEGIN SNAPSHOT 010: needed when 010 was incomplete; original file is unchanged.
-- Nexo Study V0.9.6. Additive migration; apply after 009.

create unique index if not exists study_folders_owner_id on public.study_folders(user_id,id);
create table if not exists public.conversation_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid,
  course_id text,
  material_id text,
  title text not null check (char_length(title) between 1 and 180),
  scope text not null check (scope in ('general','course','material')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  archived_at timestamptz,
  unique(user_id,id),
  unique(user_id,course_id,id),
  foreign key(user_id,workspace_id) references public.study_folders(user_id,id) on delete set null (workspace_id),
  foreign key(user_id,course_id) references public.courses(user_id,id) on delete cascade,
  foreign key(user_id,course_id,material_id) references public.materials(user_id,course_id,id) on delete cascade,
  check ((scope='general' and course_id is null and material_id is null)
    or (scope='course' and course_id is not null and material_id is null)
    or (scope='material' and course_id is not null and material_id is not null))
);

create or replace function public.valid_conversation_metadata(owner_id uuid, thread_id uuid, message_id uuid, value jsonb)
returns boolean language plpgsql immutable set search_path=public as $$
declare attachment jsonb;
begin
  if jsonb_typeof(value)<>'object' or octet_length(value::text)>24000 then return false; end if;
  if value ? 'sources' and (jsonb_typeof(value->'sources')<>'array' or jsonb_array_length(value->'sources')>10) then return false; end if;
  if value ? 'attachments' then
    if jsonb_typeof(value->'attachments')<>'array' or jsonb_array_length(value->'attachments')>4 then return false; end if;
    for attachment in select * from jsonb_array_elements(value->'attachments') loop
      if jsonb_typeof(attachment)<>'object' or not (attachment ?& array['storagePath','mimeType','name','bytes'])
        or attachment->>'mimeType' not in ('image/png','image/jpeg','image/webp')
        or length(attachment->>'name') not between 1 and 180
        or (attachment->>'bytes')::numeric not between 1 and 3145728
        or attachment->>'storagePath' !~ ('^'||owner_id||'/'||thread_id||'/'||message_id||'/[0-3]\.(png|jpg|webp)$')
      then return false; end if;
    end loop;
  end if;
  return true;
exception when others then return false;
end $$;

create table if not exists public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  thread_id uuid not null,
  role text not null check(role in ('user','assistant')),
  content text not null check(char_length(content) between 1 and 100000),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  unique(user_id,thread_id,id),
  foreign key(user_id,thread_id) references public.conversation_threads(user_id,id) on delete cascade,
  check(public.valid_conversation_metadata(user_id,thread_id,id,metadata))
);
create index if not exists conversation_threads_recent on public.conversation_threads(user_id,scope,last_message_at desc,id desc) where archived_at is null;
create index if not exists conversation_threads_course on public.conversation_threads(user_id,course_id,last_message_at desc,id desc);
create index if not exists conversation_threads_workspace on public.conversation_threads(user_id,workspace_id,last_message_at desc,id desc);
create index if not exists conversation_messages_page on public.conversation_messages(user_id,thread_id,created_at desc,id desc);
create index if not exists conversation_threads_search on public.conversation_threads using gin(to_tsvector('simple',title));

alter table public.conversation_threads enable row level security;
alter table public.conversation_messages enable row level security;
do $$ declare t text; begin
  foreach t in array array['conversation_threads','conversation_messages'] loop
    if not exists(select 1 from pg_policies where schemaname='public' and tablename=t and policyname=t||'_owner') then
      execute format('create policy %I on public.%I for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id)',t||'_owner',t);
    end if;
  end loop;
end $$;
grant select,insert,delete on public.conversation_threads,public.conversation_messages to authenticated;
grant update(title,archived_at) on public.conversation_threads to authenticated;
grant update(metadata) on public.conversation_messages to authenticated;

create or replace function public.touch_conversation_thread()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  update public.conversation_threads set last_message_at=greatest(last_message_at,new.created_at),updated_at=clock_timestamp()
    where id=new.thread_id and user_id=new.user_id;
  return new;
end $$;
revoke all on function public.touch_conversation_thread() from public;
do $$ begin
  if not exists(select 1 from pg_trigger where tgname='conversation_message_touch') then
    create trigger conversation_message_touch after insert on public.conversation_messages for each row execute function public.touch_conversation_thread();
  end if;
  if not exists(select 1 from pg_trigger where tgname='conversation_thread_updated') then
    create trigger conversation_thread_updated before update on public.conversation_threads for each row execute function public.touch_learning_workspace_updated_at();
  end if;
end $$;

-- Creation and first real message are atomic. Retries retain immutable message IDs.
create or replace function public.append_conversation_message(p_thread jsonb,p_message jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare uid uuid:=auth.uid(); t public.conversation_threads; m public.conversation_messages;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if not coalesce((p_thread->>'ensure_existing')::boolean,false) then
  insert into public.conversation_threads(id,user_id,workspace_id,course_id,material_id,title,scope)
    values((p_thread->>'id')::uuid,uid,(p_thread->>'workspace_id')::uuid,p_thread->>'course_id',p_thread->>'material_id',p_thread->>'title',p_thread->>'scope')
    on conflict(id) do nothing;
  end if;
  select * into t from public.conversation_threads where id=(p_thread->>'id')::uuid and user_id=uid for update;
  if t.id is null or t.scope is distinct from p_thread->>'scope'
    or t.course_id is distinct from p_thread->>'course_id' or t.material_id is distinct from p_thread->>'material_id'
    or t.workspace_id is distinct from (p_thread->>'workspace_id')::uuid or t.archived_at is not null then
    raise exception 'Conversation unavailable in this context';
  end if;
  insert into public.conversation_messages(id,user_id,thread_id,role,content,metadata)
    values((p_message->>'id')::uuid,uid,t.id,p_message->>'role',p_message->>'content',coalesce(p_message->'metadata','{}'::jsonb))
    on conflict(id) do nothing;
  select * into m from public.conversation_messages where id=(p_message->>'id')::uuid and user_id=uid and thread_id=t.id;
  if m.id is null or m.role is distinct from p_message->>'role' or m.content is distinct from p_message->>'content' then
    raise exception 'Message identity conflict';
  end if;
  select * into t from public.conversation_threads where id=t.id and user_id=uid;
  return jsonb_build_object('thread',to_jsonb(t),'message',to_jsonb(m));
end $$;
revoke all on function public.append_conversation_message(jsonb,jsonb) from public;
grant execute on function public.append_conversation_message(jsonb,jsonb) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('conversation-images','conversation-images',false,3145728,array['image/png','image/jpeg','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
do $$ begin
  if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='conversation_images_owner') then
    create policy conversation_images_owner on storage.objects for all to authenticated
    using(bucket_id='conversation-images' and (storage.foldername(name))[1]=auth.uid()::text)
    with check(bucket_id='conversation-images' and (storage.foldername(name))[1]=auth.uid()::text and exists(
      select 1 from public.conversation_messages m where m.user_id=auth.uid()
        and m.thread_id::text=(storage.foldername(name))[2] and m.id::text=(storage.foldername(name))[3]
        and exists(select 1 from jsonb_array_elements(coalesce(m.metadata->'attachments','[]'::jsonb)) a where a->>'storagePath'=name)
    ));
  end if;
end $$;

alter table public.learning_state
  add column if not exists evidence_managed boolean not null default false,
  add column if not exists legacy_baseline jsonb not null default '{}'::jsonb,
  add column if not exists evidence_count integer not null default 0,
  add column if not exists last_seen timestamptz,
  add column if not exists last_practiced timestamptz,
  add column if not exists last_result text;
-- Existing mastery remains intact. It is explicitly labelled legacy evidence.
update public.learning_state set legacy_baseline=jsonb_build_object('attempts',attempts,'correct',correct_attempts,'confidence',confidence,'updated',updated_at)
where legacy_baseline='{}'::jsonb and attempts>0 and not evidence_managed;

create table if not exists public.concept_evidence (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id text not null,
  material_id text not null,
  concept_key text not null check(char_length(concept_key) between 1 and 90),
  concept_label text not null check(char_length(concept_label) between 1 and 240),
  source_type text not null check(source_type in ('quiz','flashcard','written','chat','study_session')),
  source_id text not null check(char_length(source_id) between 1 and 180),
  result text not null check(result in ('again','hard','good','easy','question','seen')),
  weight numeric not null default 1 check(weight between 0 and 1),
  thread_id uuid,
  message_id uuid,
  created_at timestamptz not null default clock_timestamp(),
  foreign key(user_id,course_id,material_id) references public.materials(user_id,course_id,id) on delete cascade,
  foreign key(user_id,course_id,thread_id) references public.conversation_threads(user_id,course_id,id) on delete cascade,
  foreign key(user_id,thread_id,message_id) references public.conversation_messages(user_id,thread_id,id) on delete cascade,
  check((source_type in ('quiz','written') and result in ('again','good')) or (source_type='flashcard' and result in ('again','hard','good','easy')) or (source_type='chat' and result='question') or (source_type='study_session' and result='seen')),
  check((source_type='chat' and result='question' and thread_id is not null and message_id is not null)
    or (source_type<>'chat' and thread_id is null and message_id is null)),
  unique(user_id,source_type,source_id,concept_key)
);
create index if not exists concept_evidence_recent on public.concept_evidence(user_id,course_id,created_at desc,id desc);
create index if not exists concept_evidence_concept on public.concept_evidence(user_id,material_id,concept_key,created_at,id);
alter table public.concept_evidence enable row level security;
do $$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='concept_evidence' and policyname='concept_evidence_owner') then
    create policy concept_evidence_owner on public.concept_evidence for all to authenticated
      using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
  end if;
end $$;
grant select,insert,delete on public.concept_evidence to authenticated;

create or replace function public.normalize_concept_evidence()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
  new.weight:=case when new.source_type in ('chat','study_session') then 0 when new.source_type='written' then .5 else 1 end;
  if new.source_type='chat' and not exists(select 1 from public.conversation_threads t
    where t.id=new.thread_id and t.user_id=new.user_id and t.course_id=new.course_id
      and (t.material_id is null or t.material_id=new.material_id)) then raise exception 'Evidence context mismatch'; end if;
  return new;
end $$;

-- Only evidence triggers / checked reset RPC can rewrite a managed concept.
-- Older clients can still import legacy rows, but cannot overwrite newer evidence.
create or replace function public.protect_evidence_state()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
  if current_user in ('authenticated','anon') then
    if tg_op='UPDATE' and old.evidence_managed then return old; end if;
    new.evidence_managed:=false; new.legacy_baseline:='{}'::jsonb;
    new.evidence_count:=0; new.last_seen:=null; new.last_practiced:=null; new.last_result:=null;
  end if;
  return new;
end $$;

create or replace function public.recompute_concept_state(owner_id uuid, material_key text, concept text)
returns void language plpgsql security definer set search_path=public as $$
declare s public.learning_state; e public.concept_evidence; label text; course_key text;
  attempts_count integer:=0; correct_count integer:=0; confidence_score numeric:=0; evidence_total integer:=0;
  seen_at timestamptz; practiced_at timestamptz; last_answer text; state text:='unknown';
begin
  if not exists(select 1 from public.materials m join public.courses c on c.user_id=m.user_id and c.id=m.course_id where m.user_id=owner_id and m.id=material_key) then return; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text||':'||material_key||':'||concept,0));
  select * into s from public.learning_state where user_id=owner_id and material_id=material_key and concept_key=concept for update;
  if s.id is not null then
    label:=s.concept_label; course_key:=s.course_id;
    if not s.evidence_managed and s.attempts>0 then
      s.legacy_baseline:=jsonb_build_object('attempts',s.attempts,'correct',s.correct_attempts,'confidence',s.confidence,'updated',s.updated_at);
    end if;
    attempts_count:=coalesce((s.legacy_baseline->>'attempts')::integer,0);
    correct_count:=coalesce((s.legacy_baseline->>'correct')::integer,0);
    confidence_score:=coalesce((s.legacy_baseline->>'confidence')::numeric,0);
    practiced_at:=(s.legacy_baseline->>'updated')::timestamptz;
  end if;
  for e in select * from public.concept_evidence where user_id=owner_id and material_id=material_key and concept_key=concept order by created_at,id loop
    label:=e.concept_label; course_key:=e.course_id; evidence_total:=evidence_total+1; seen_at:=e.created_at;
    if e.weight>0 and e.result in ('again','hard','good','easy') then
      attempts_count:=attempts_count+1;
      correct_count:=correct_count+case when e.result in ('good','easy') then 1 else 0 end;
      confidence_score:=round(confidence_score*(1-.36*e.weight)+(case e.result when 'again' then 0 when 'hard' then .35 when 'good' then .78 else 1 end)*.36*e.weight,3);
      practiced_at:=e.created_at; last_answer:=e.result;
    end if;
  end loop;
  if course_key is null then return; end if;
  if attempts_count>0 then state:='learning'; end if;
  if attempts_count>=3 and confidence_score>=.82 then state:='mastered';
  elsif attempts_count>=2 and confidence_score>=.53 then state:='known'; end if;
  insert into public.learning_state(user_id,course_id,material_id,concept_key,concept_label,status,confidence,attempts,correct_attempts,
    evidence_managed,legacy_baseline,evidence_count,last_seen,last_practiced,last_result)
  values(owner_id,course_key,material_key,concept,label,state,confidence_score,attempts_count,correct_count,true,
    coalesce(s.legacy_baseline,'{}'::jsonb),evidence_total,seen_at,practiced_at,last_answer)
  on conflict(user_id,material_id,concept_key) do update set concept_label=excluded.concept_label,status=excluded.status,
    confidence=excluded.confidence,attempts=excluded.attempts,correct_attempts=excluded.correct_attempts,evidence_managed=true,
    legacy_baseline=excluded.legacy_baseline,evidence_count=excluded.evidence_count,last_seen=excluded.last_seen,
    last_practiced=excluded.last_practiced,last_result=excluded.last_result;
end $$;
revoke all on function public.recompute_concept_state(uuid,text,text) from public;
create or replace function public.evidence_updates_state()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='DELETE' then perform public.recompute_concept_state(old.user_id,old.material_id,old.concept_key); return old; end if;
  perform public.recompute_concept_state(new.user_id,new.material_id,new.concept_key); return new;
end $$;
revoke all on function public.evidence_updates_state() from public;
do $$ begin
  if not exists(select 1 from pg_trigger where tgname='evidence_normalized') then
    create trigger evidence_normalized before insert on public.concept_evidence for each row execute function public.normalize_concept_evidence();
  end if;
  if not exists(select 1 from pg_trigger where tgname='evidence_state_updated') then
    create trigger evidence_state_updated after insert or delete on public.concept_evidence for each row execute function public.evidence_updates_state();
  end if;
  if not exists(select 1 from pg_trigger where tgname='learning_state_protected') then
    create trigger learning_state_protected before insert or update on public.learning_state for each row execute function public.protect_evidence_state();
  end if;
end $$;

create or replace function public.record_concept_evidence(p_evidence jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare uid uuid:=auth.uid(); e public.concept_evidence; s public.learning_state;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  insert into public.concept_evidence(id,user_id,course_id,material_id,concept_key,concept_label,source_type,source_id,result,thread_id,message_id)
  values((p_evidence->>'id')::uuid,uid,p_evidence->>'course_id',p_evidence->>'material_id',p_evidence->>'concept_key',
    p_evidence->>'concept_label',p_evidence->>'source_type',p_evidence->>'source_id',p_evidence->>'result',
    (p_evidence->>'thread_id')::uuid,(p_evidence->>'message_id')::uuid) on conflict(id) do nothing;
  select * into e from public.concept_evidence where id=(p_evidence->>'id')::uuid and user_id=uid;
  if e.id is null or e.course_id is distinct from p_evidence->>'course_id' or e.material_id is distinct from p_evidence->>'material_id'
    or e.concept_key is distinct from p_evidence->>'concept_key' or e.result is distinct from p_evidence->>'result'
    or e.source_type is distinct from p_evidence->>'source_type' or e.source_id is distinct from p_evidence->>'source_id'
    or e.thread_id is distinct from (p_evidence->>'thread_id')::uuid or e.message_id is distinct from (p_evidence->>'message_id')::uuid
    then raise exception 'Evidence identity conflict'; end if;
  select * into s from public.learning_state where user_id=uid and material_id=e.material_id and concept_key=e.concept_key;
  return to_jsonb(s);
end $$;
revoke all on function public.record_concept_evidence(jsonb) from public;
grant execute on function public.record_concept_evidence(jsonb) to authenticated;

create or replace function public.reset_course_learning_memory(p_course_id text)
returns void language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); s public.learning_state;
begin
  if uid is null or not exists(select 1 from public.courses where user_id=uid and id=p_course_id) then raise exception 'Course unavailable'; end if;
  for s in select * from public.learning_state where user_id=uid and course_id=p_course_id order by material_id,concept_key loop
    perform pg_advisory_xact_lock(hashtextextended(uid::text||':'||s.material_id||':'||s.concept_key,0));
    update public.learning_state set legacy_baseline='{}'::jsonb,evidence_managed=true where id=s.id;
    delete from public.concept_evidence where user_id=uid and material_id=s.material_id and concept_key=s.concept_key;
    perform public.recompute_concept_state(uid,s.material_id,s.concept_key);
  end loop;
end $$;
revoke all on function public.reset_course_learning_memory(text) from public;
grant execute on function public.reset_course_learning_memory(text) to authenticated;
-- END SNAPSHOT 010

-- Existing tables also need the composite ownership relationships from 010.
-- CREATE TABLE IF NOT EXISTS does not add missing constraints to legacy tables.
alter table public.conversation_threads alter column course_id drop not null, alter column material_id drop not null;
do $$
declare item record; keys smallint[]; ref_keys smallint[];
begin
  for item in select * from (values
    ('conversation_threads',array['user_id','id'],'nexo_012_threads_owner_id'),
    ('conversation_threads',array['user_id','course_id','id'],'nexo_012_threads_owner_course_id'),
    ('conversation_messages',array['user_id','thread_id','id'],'nexo_012_messages_owner_thread_id')
  ) as spec(table_name,columns,constraint_name) loop
    select array_agg(a.attnum order by u.n) into keys from unnest(item.columns) with ordinality u(name,n)
      join pg_attribute a on a.attrelid=to_regclass('public.'||item.table_name) and a.attname=u.name and not a.attisdropped;
    if cardinality(keys)<>cardinality(item.columns) then raise exception '012: %.% columns are missing',item.table_name,item.columns; end if;
    if not exists(select 1 from pg_constraint where conrelid=to_regclass('public.'||item.table_name) and contype in ('u','p') and conkey=keys) then
      execute format('alter table public.%I add constraint %I unique (%s)',item.table_name,item.constraint_name,array_to_string(item.columns,','));
    end if;
  end loop;
  for item in select * from (values
    ('conversation_threads',array['user_id'],'auth.users',array['id'],'nexo_012_threads_user','cascade','c'),
    ('conversation_threads',array['user_id','workspace_id'],'public.study_folders',array['user_id','id'],'nexo_012_threads_workspace','set null (workspace_id)','n'),
    ('conversation_threads',array['user_id','course_id'],'public.courses',array['user_id','id'],'nexo_012_threads_course','cascade','c'),
    ('conversation_threads',array['user_id','course_id','material_id'],'public.materials',array['user_id','course_id','id'],'nexo_012_threads_material','cascade','c'),
    ('conversation_messages',array['user_id'],'auth.users',array['id'],'nexo_012_messages_user','cascade','c'),
    ('conversation_messages',array['user_id','thread_id'],'public.conversation_threads',array['user_id','id'],'nexo_012_messages_thread','cascade','c'),
    ('concept_evidence',array['user_id'],'auth.users',array['id'],'nexo_012_evidence_user','cascade','c'),
    ('concept_evidence',array['user_id','course_id','material_id'],'public.materials',array['user_id','course_id','id'],'nexo_012_evidence_material','cascade','c'),
    ('concept_evidence',array['user_id','course_id','thread_id'],'public.conversation_threads',array['user_id','course_id','id'],'nexo_012_evidence_thread','cascade','c'),
    ('concept_evidence',array['user_id','thread_id','message_id'],'public.conversation_messages',array['user_id','thread_id','id'],'nexo_012_evidence_message','cascade','c')
  ) as spec(table_name,columns,ref_table,ref_columns,constraint_name,delete_action,delete_code) loop
    select array_agg(a.attnum order by u.n) into keys from unnest(item.columns) with ordinality u(name,n)
      join pg_attribute a on a.attrelid=to_regclass('public.'||item.table_name) and a.attname=u.name and not a.attisdropped;
    select array_agg(a.attnum order by u.n) into ref_keys from unnest(item.ref_columns) with ordinality u(name,n)
      join pg_attribute a on a.attrelid=to_regclass(item.ref_table) and a.attname=u.name and not a.attisdropped;
    if cardinality(keys)<>cardinality(item.columns) or cardinality(ref_keys)<>cardinality(item.ref_columns) then
      raise exception '012: % has incomplete relationship columns. No repair was committed.',item.table_name;
    end if;
    if not exists(select 1 from pg_constraint where conrelid=to_regclass('public.'||item.table_name) and contype='f'
      and conkey=keys and confrelid=to_regclass(item.ref_table) and confkey=ref_keys and confdeltype::text=item.delete_code and convalidated) then
      execute format('alter table public.%I add constraint %I foreign key (%s) references %s (%s) on delete %s',
        item.table_name,item.constraint_name,array_to_string(item.columns,','),item.ref_table,array_to_string(item.ref_columns,','),item.delete_action);
    end if;
  end loop;
  if not exists(select 1 from pg_constraint where conrelid='public.conversation_threads'::regclass and conname='nexo_012_threads_scope') then
    alter table public.conversation_threads add constraint nexo_012_threads_scope check(
      (scope='general' and course_id is null and material_id is null)
      or (scope='course' and course_id is not null and material_id is null)
      or (scope='material' and course_id is not null and material_id is not null));
  end if;
end $$;

-- BEGIN SNAPSHOT 011: install even if the original 011 transaction rolled back.
-- Nexo Study V0.9.7. Reuse the academic model; apply after 010. Repeatable.

alter table public.materials drop constraint if exists materials_source_type_check;
alter table public.materials add constraint materials_source_type_check
  check(source_type in ('text','pdf','image','docx','pptx','web','youtube','note'));
comment on column public.materials.metadata is 'Bounded source metadata, unit references, processing error, archive/cleanup state and sourceRevision. Full normalized text/blocks live in content/pages; PDF text remains in chunks.';
comment on column public.material_chunks.page_start is 'Stable normalized unit ordinal: PDF page, presentation slide, document section or transcript segment. Labels/timestamps are in materials.metadata.source.units.';

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('study-sources','study-sources',false,20971520,array['image/png','image/jpeg','image/webp','text/plain','text/markdown',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.presentationml.presentation'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create table if not exists public.academic_cleanup_jobs (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  course_id text not null, material_id text, status text not null default 'pending' check(status in ('pending','failed','complete')),
  manifest jsonb not null default '[]' check(jsonb_typeof(manifest)='array'),
  last_error text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists academic_cleanup_active on public.academic_cleanup_jobs(user_id,course_id,coalesce(material_id,'')) where status<>'complete';
alter table public.academic_cleanup_jobs enable row level security;
drop policy if exists academic_cleanup_owner on public.academic_cleanup_jobs;
create policy academic_cleanup_owner on public.academic_cleanup_jobs for select to authenticated using(auth.uid()=user_id);
grant select on public.academic_cleanup_jobs to authenticated;
revoke insert,update,delete on public.academic_cleanup_jobs from authenticated;

-- Only existing owned materials accept originals; queued deletion freezes uploads.
drop policy if exists study_sources_owner_select on storage.objects;
create policy study_sources_owner_select on storage.objects for select to authenticated
using(bucket_id='study-sources' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists study_sources_owner_write on storage.objects;
create policy study_sources_owner_write on storage.objects for insert to authenticated with check(
  bucket_id='study-sources' and (storage.foldername(name))[1]=auth.uid()::text
  and exists(select 1 from public.materials m where m.user_id=auth.uid() and m.course_id=(storage.foldername(name))[2] and m.id=(storage.foldername(name))[3])
  and not exists(select 1 from public.academic_cleanup_jobs j where j.user_id=auth.uid() and j.course_id=(storage.foldername(name))[2]
    and (j.material_id is null or j.material_id=(storage.foldername(name))[3]) and j.status<>'complete'));
drop policy if exists study_sources_owner_update on storage.objects;
create policy study_sources_owner_update on storage.objects for update to authenticated
using(bucket_id='study-sources' and (storage.foldername(name))[1]=auth.uid()::text)
with check(bucket_id='study-sources' and (storage.foldername(name))[1]=auth.uid()::text
  and exists(select 1 from public.materials m where m.user_id=auth.uid() and m.course_id=(storage.foldername(name))[2] and m.id=(storage.foldername(name))[3])
  and not exists(select 1 from public.academic_cleanup_jobs j where j.user_id=auth.uid() and j.course_id=(storage.foldername(name))[2]
    and (j.material_id is null or j.material_id=(storage.foldername(name))[3]) and j.status<>'complete'));
drop policy if exists study_sources_owner_delete on storage.objects;
create policy study_sources_owner_delete on storage.objects for delete to authenticated
using(bucket_id='study-sources' and (storage.foldername(name))[1]=auth.uid()::text);

create or replace function public.academic_blob_manifest(owner_id uuid,course_key text,material_key text)
returns jsonb language sql stable security definer set search_path=public,storage as $$
  select coalesce(jsonb_agg(jsonb_build_object('bucket',o.bucket_id,'path',o.name) order by o.bucket_id,o.name),'[]'::jsonb)
  from storage.objects o where
    (o.bucket_id in ('study-pdfs','study-sources','solution-images') and
      left(o.name,length(owner_id::text||'/'||course_key||'/'))=owner_id::text||'/'||course_key||'/'
      and (material_key is null or (o.bucket_id in ('study-pdfs','study-sources') and
        left(o.name,length(owner_id::text||'/'||course_key||'/'||material_key||'/'))=owner_id::text||'/'||course_key||'/'||material_key||'/')))
    or (o.bucket_id='conversation-images' and (storage.foldername(o.name))[1]=owner_id::text
      and exists(select 1 from public.conversation_threads t where t.user_id=owner_id and t.course_id=course_key
        and (material_key is null or t.material_id=material_key) and t.id::text=(storage.foldername(o.name))[2]));
$$;
revoke all on function public.academic_blob_manifest(uuid,text,text) from public;

create or replace function public.guard_academic_delete()
returns trigger language plpgsql security definer set search_path=public as $$
declare course_key text; material_key text;
begin
  course_key:=case when tg_table_name='courses' then to_jsonb(old)->>'id' else to_jsonb(old)->>'course_id' end;
  material_key:=case when tg_table_name='materials' then to_jsonb(old)->>'id' else null end;
  if jsonb_array_length(public.academic_blob_manifest(old.user_id,course_key,material_key))>0 then
    raise exception 'Private originals must be cleaned before deleting academic metadata';
  end if;
  return old;
end $$;
revoke all on function public.guard_academic_delete() from public;
drop trigger if exists academic_course_delete_guard on public.courses;
create trigger academic_course_delete_guard before delete on public.courses for each row execute function public.guard_academic_delete();
drop trigger if exists academic_material_delete_guard on public.materials;
create trigger academic_material_delete_guard before delete on public.materials for each row execute function public.guard_academic_delete();

-- JSON row access supports the existing heterogeneous academic tables.
create or replace function public.guard_academic_write()
returns trigger language plpgsql security invoker set search_path=public as $$
declare course_key text; material_key text; row_json jsonb:=to_jsonb(new);
begin
  course_key:=case when tg_table_name='courses' then row_json->>'id' else row_json->>'course_id' end;
  material_key:=case when tg_table_name='materials' then row_json->>'id' when tg_table_name='study_artifacts' then row_json->>'source_material_id' else row_json->>'material_id' end;
  perform 1 from public.courses where user_id=new.user_id and id=course_key for key share;
  if exists(select 1 from public.academic_cleanup_jobs j where j.user_id=new.user_id and j.course_id=course_key
    and (j.material_id is null or j.material_id=material_key)) then
    raise exception 'Academic deletion pending; retry cleanup before editing';
  end if;
  if tg_table_name='materials' and tg_op='UPDATE' then
    if coalesce((row_json->'metadata'->>'sourceRevision')::integer,0)<coalesce((to_jsonb(old)->'metadata'->>'sourceRevision')::integer,0) then return old; end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_academic_write() from public;
do $$ declare t text; begin
  foreach t in array array['courses','materials','material_chunks','material_topics','study_artifacts','concept_evidence','study_progress','study_sessions','saved_solutions'] loop
    execute format('drop trigger if exists academic_write_guard on public.%I',t);
    execute format('create trigger academic_write_guard before insert or update on public.%I for each row execute function public.guard_academic_write()',t);
  end loop;
end $$;

create or replace function public.guard_cleanup_storage_write()
returns trigger language plpgsql security definer set search_path=public,storage as $$
declare uid uuid; course_key text; material_key text;
begin
  if new.bucket_id not in ('study-pdfs','study-sources','solution-images','conversation-images') then return new; end if;
  begin uid:=((storage.foldername(new.name))[1])::uuid; exception when others then return new; end;
  if new.bucket_id='conversation-images' then
    select t.course_id,t.material_id into course_key,material_key from public.conversation_threads t
      where t.user_id=uid and t.id::text=(storage.foldername(new.name))[2];
  else course_key:=(storage.foldername(new.name))[2]; material_key:=(storage.foldername(new.name))[3]; end if;
  if course_key is not null then
    perform 1 from public.courses where user_id=uid and id=course_key for key share;
    if exists(select 1 from public.academic_cleanup_jobs j where j.user_id=uid and j.course_id=course_key
      and (j.material_id is null or j.material_id=material_key) and j.status<>'complete') then raise exception 'Academic deletion pending'; end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_cleanup_storage_write() from public;
drop trigger if exists academic_storage_write_guard on storage.objects;
create trigger academic_storage_write_guard before insert or update on storage.objects for each row execute function public.guard_cleanup_storage_write();

create or replace function public.guard_cleanup_conversation_write()
returns trigger language plpgsql security definer set search_path=public as $$
declare course_key text; material_key text;
begin
  if tg_table_name='conversation_threads' then course_key:=new.course_id; material_key:=new.material_id;
  else select t.course_id,t.material_id into course_key,material_key from public.conversation_threads t where t.user_id=new.user_id and t.id=new.thread_id; end if;
  if course_key is not null then
    perform 1 from public.courses where user_id=new.user_id and id=course_key for key share;
    if exists(select 1 from public.academic_cleanup_jobs j where j.user_id=new.user_id and j.course_id=course_key
      and (j.material_id is null or j.material_id=material_key) and j.status<>'complete') then raise exception 'Academic deletion pending'; end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_cleanup_conversation_write() from public;
drop trigger if exists academic_conversation_write_guard on public.conversation_threads;
create trigger academic_conversation_write_guard before insert or update on public.conversation_threads for each row execute function public.guard_cleanup_conversation_write();
drop trigger if exists academic_message_write_guard on public.conversation_messages;
create trigger academic_message_write_guard before insert or update on public.conversation_messages for each row execute function public.guard_cleanup_conversation_write();

create or replace function public.begin_academic_cleanup(p_course_id text,p_material_id text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); j public.academic_cleanup_jobs;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  perform 1 from public.courses where user_id=uid and id=p_course_id for update;
  if not found then raise exception 'Course unavailable'; end if;
  if p_material_id is not null then
    perform 1 from public.materials where user_id=uid and course_id=p_course_id and id=p_material_id for update;
    if not found then raise exception 'Material unavailable'; end if;
  end if;
  select * into j from public.academic_cleanup_jobs where user_id=uid and course_id=p_course_id and material_id is not distinct from p_material_id and status<>'complete';
  if j.id is null then
    update public.materials set metadata=metadata||jsonb_build_object('deletionPending',true)
      where user_id=uid and course_id=p_course_id and (p_material_id is null or id=p_material_id);
    insert into public.academic_cleanup_jobs(user_id,course_id,material_id,manifest)
      values(uid,p_course_id,p_material_id,public.academic_blob_manifest(uid,p_course_id,p_material_id)) returning * into j;
  end if;
  return to_jsonb(j);
end $$;
revoke all on function public.begin_academic_cleanup(text,text) from public;
grant execute on function public.begin_academic_cleanup(text,text) to authenticated;

create or replace function public.record_academic_cleanup_failure(p_job_id uuid,p_error text)
returns void language plpgsql security definer set search_path=public as $$
begin
  update public.academic_cleanup_jobs set status='failed',last_error=left(p_error,500),updated_at=now()
    where id=p_job_id and user_id=auth.uid() and status<>'complete';
  if not found then raise exception 'Cleanup unavailable'; end if;
end $$;
revoke all on function public.record_academic_cleanup_failure(uuid,text) from public;
grant execute on function public.record_academic_cleanup_failure(uuid,text) to authenticated;

create or replace function public.finish_academic_cleanup(p_job_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); j public.academic_cleanup_jobs;
begin
  select * into j from public.academic_cleanup_jobs where user_id=uid and id=p_job_id for update;
  if j.id is null then raise exception 'Cleanup unavailable'; end if;
  if j.status='complete' then return; end if;
  perform 1 from public.courses where user_id=uid and id=j.course_id for update;
  if exists(select 1 from jsonb_array_elements(j.manifest) a join storage.objects o on o.bucket_id=a->>'bucket' and o.name=a->>'path')
    or jsonb_array_length(public.academic_blob_manifest(uid,j.course_id,j.material_id))>0 then raise exception 'Storage cleanup is incomplete'; end if;
  if j.material_id is null then delete from public.courses where user_id=uid and id=j.course_id;
  else delete from public.materials where user_id=uid and course_id=j.course_id and id=j.material_id; end if;
  update public.academic_cleanup_jobs set status='complete',last_error=null,updated_at=now() where id=j.id;
end $$;
revoke all on function public.finish_academic_cleanup(uuid) from public;
grant execute on function public.finish_academic_cleanup(uuid) to authenticated;

-- One transaction replaces normalized content + retrieval and invalidates derived
-- resources. Historical practice evidence remains attached to the same material.
create or replace function public.commit_source_document(p_course_id text,p_material_id text,p_expected_revision integer,p_document jsonb)
returns void language plpgsql security invoker set search_path=public as $$
declare uid uuid:=auth.uid(); m public.materials; c jsonb; t jsonb; summary_version integer;
begin
  perform 1 from public.courses where user_id=uid and id=p_course_id for key share;
  select * into m from public.materials where user_id=uid and course_id=p_course_id and id=p_material_id for update;
  if m.id is null or m.source_type='pdf' then raise exception 'Source unavailable'; end if;
  if coalesce((m.metadata->>'sourceRevision')::integer,0)<>p_expected_revision then raise exception 'Source changed; reload before saving'; end if;
  if jsonb_typeof(p_document)<>'object' or not (p_document ?& array['title','text','pages','metadata','chunks','topics'])
    or not ((p_document->'metadata') ? 'sourceRevision') or p_expected_revision<0
    or length(p_document->>'title') not between 1 and 180
    or length(p_document->>'text')>300000 or jsonb_typeof(p_document->'pages')<>'array' or jsonb_array_length(p_document->'pages')>500
    or jsonb_typeof(p_document->'metadata')<>'object' or octet_length((p_document->'metadata')::text)>150000
    or (p_document->'metadata'->>'sourceRevision')::integer<>p_expected_revision+1
    or jsonb_typeof(p_document->'chunks')<>'array' or jsonb_array_length(p_document->'chunks')>600
    or jsonb_typeof(p_document->'topics')<>'array' or jsonb_array_length(p_document->'topics')>200 then raise exception 'Invalid normalized source'; end if;
  if jsonb_typeof(p_document->'metadata'->'source')<>'object' or p_document->>'analysis_status' not in ('ready','partial')
    or exists(select 1 from jsonb_array_elements(p_document->'pages') with ordinality as u(value,n)
      where jsonb_typeof(value)<>'object' or jsonb_typeof(value->'text')<>'string' or jsonb_typeof(value->'page')<>'number'
      or (value->>'page')::integer<>n or length(value->>'text')>300000 or length(coalesce(value->>'heading',''))>180
      or value ? 'timestamp' and (jsonb_typeof(value->'timestamp')<>'number' or (value->>'timestamp')::numeric<0)
      or value ? 'blocks' and (jsonb_typeof(value->'blocks')<>'array' or jsonb_array_length(value->'blocks')>10000))
    or exists(select 1 from jsonb_array_elements(p_document->'chunks') as cu(value)
      where coalesce((cu.value->>'pageStart')::integer,0)<1 or (cu.value->>'pageEnd')::integer<(cu.value->>'pageStart')::integer
      or (cu.value->>'pageEnd')::integer>jsonb_array_length(p_document->'pages') or length(coalesce(cu.value->>'text','')) not between 1 and 6000)
    then raise exception 'Invalid source units or chunk references'; end if;
  if m.source_type in ('docx','pptx','image') and (m.storage_path is null or not exists(select 1 from storage.objects o where o.bucket_id='study-sources' and o.name=m.storage_path)) then raise exception 'Private original is not stored'; end if;
  update public.materials set title=p_document->>'title',content=p_document->>'text',pages=p_document->'pages',page_count=jsonb_array_length(p_document->'pages'),
    metadata=p_document->'metadata',document_kind='text',analysis_status=coalesce(p_document->>'analysis_status','ready'),processing_status='ready',study_pack=null,study_pack_meta=null,
    analyzed_pages=array(select (a->>'page')::integer from jsonb_array_elements(p_document->'pages') a where trim(a->>'text')<>'')
    where user_id=uid and id=p_material_id;
  delete from public.material_chunks where user_id=uid and material_id=p_material_id;
  delete from public.material_topics where user_id=uid and material_id=p_material_id;
  for c in select jsonb_array_elements(p_document->'chunks') loop
    insert into public.material_chunks(id,user_id,course_id,material_id,page_start,page_end,content,keywords)
      values((c->>'id')::uuid,uid,p_course_id,p_material_id,(c->>'pageStart')::integer,(c->>'pageEnd')::integer,c->>'text',array(select jsonb_array_elements_text(c->'keywords')));
  end loop;
  for t in select jsonb_array_elements(p_document->'topics') loop
    insert into public.material_topics(id,user_id,course_id,material_id,title,summary,page_start,page_end,keywords)
      values((t->>'id')::uuid,uid,p_course_id,p_material_id,t->>'title',t->>'summary',(t->>'pageStart')::integer,(t->>'pageEnd')::integer,array(select jsonb_array_elements_text(t->'keywords')));
  end loop;
  update public.study_artifacts set status='failed',error_message='El contenido cambió. Vuelve a generar este recurso.' where user_id=uid and source_material_id=p_material_id;
  if length(p_document->'summary'->>'summary')>0 then
    select coalesce(max(version),0)+1 into summary_version from public.study_artifacts where user_id=uid and source_material_id=p_material_id and type='summary';
    insert into public.study_artifacts(user_id,course_id,source_material_id,type,status,payload,version)
      values(uid,p_course_id,p_material_id,'summary','ready',p_document->'summary',summary_version);
  end if;
end $$;
revoke all on function public.commit_source_document(text,text,integer,jsonb) from public;
grant execute on function public.commit_source_document(text,text,integer,jsonb) to authenticated;

create or replace function public.archive_source_material(p_course_id text,p_material_id text,p_archived boolean)
returns integer language plpgsql security invoker set search_path=public as $$
declare uid uuid:=auth.uid(); m public.materials; revision integer;
begin
  perform 1 from public.courses where user_id=uid and id=p_course_id for key share;
  select * into m from public.materials where user_id=uid and course_id=p_course_id and id=p_material_id for update;
  if m.id is null then raise exception 'Material unavailable'; end if;
  revision:=coalesce((m.metadata->>'sourceRevision')::integer,0)+1;
  update public.materials set metadata=metadata||jsonb_build_object('archivedAt',case when p_archived then to_jsonb(clock_timestamp()) else 'null'::jsonb end,'sourceRevision',revision)
    where user_id=uid and id=p_material_id;
  return revision;
end $$;
revoke all on function public.archive_source_material(text,text,boolean) from public;
grant execute on function public.archive_source_material(text,text,boolean) to authenticated;

-- A rename advances the same revision as editing/archiving: stale catalog saves cannot undo it.
create or replace function public.rename_source_material(p_course_id text, p_material_id text, p_title text, p_expected_revision integer)
returns void language plpgsql security invoker set search_path = public as $$
declare m public.materials;
begin
  perform 1 from public.courses where id=p_course_id and user_id=(select auth.uid()) for key share;
  select * into m from public.materials where id=p_material_id and course_id=p_course_id and user_id=(select auth.uid()) for update;
  if not found then raise exception 'Source not owned'; end if;
  if coalesce((m.metadata->>'sourceRevision')::integer,0) <> p_expected_revision then raise exception 'Source changed; refresh before renaming'; end if;
  if length(trim(p_title)) not between 1 and 180 then raise exception 'Invalid title'; end if;
  update public.materials set title=trim(p_title), metadata=coalesce(metadata,'{}')||jsonb_build_object('sourceRevision',p_expected_revision+1) where id=m.id;
end; $$;
revoke all on function public.rename_source_material(text,text,text,integer) from public;
grant execute on function public.rename_source_material(text,text,text,integer) to authenticated;

-- Retrieval follows the visible source catalog, including archive and cleanup state.
create or replace function public.search_material_chunks_v2(
  p_course_id text, p_question text, p_material_id text default null, p_limit integer default 6
)
returns table (id uuid, material_id text, page_start integer, page_end integer, content text, keywords text[], score real)
language sql stable security invoker set search_path = public as $$
  with terms as (
    select distinct term from regexp_split_to_table(
      public.nexo_search_normalize(left(coalesce(p_question, ''), 500)), '[^a-z0-9]+'
    ) as term
    where length(term) >= 3 and term not in ('que', 'como', 'con', 'para', 'por', 'una', 'los', 'las', 'del', 'segun')
    limit 12
  ), search_query as (
    select to_tsquery('simple', coalesce(string_agg(term, ' | '), 'nexosincoincidencia')) as value from terms
  )
  select c.id, c.material_id, c.page_start, c.page_end, c.content, c.keywords,
    ts_rank_cd(to_tsvector('simple', public.nexo_search_normalize(c.content)), q.value)::real as score
  from public.material_chunks c
  join public.materials m on m.id=c.material_id and m.user_id=c.user_id
  cross join search_query q
  where c.user_id = (select auth.uid()) and c.course_id = p_course_id
    and nullif(m.metadata->>'archivedAt','') is null and coalesce((m.metadata->>'deletionPending')::boolean,false)=false
    and (p_material_id is null or c.material_id = p_material_id)
    and to_tsvector('simple', public.nexo_search_normalize(c.content)) @@ q.value
  order by score desc, c.page_start
  limit least(greatest(p_limit, 1), 10);
$$;
-- END SNAPSHOT 011

-- A result row appears ONLY after the complete transaction committed.
commit;
select '012 complete: PDF metadata, text context keys, conversations and universal sources repaired' as migration_status;
