-- Nexo Study V0.9.7. Reuse the academic model; apply after 010. Repeatable.
begin;

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


commit;
