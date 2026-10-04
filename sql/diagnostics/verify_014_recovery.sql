-- One read-only query. Results describe actual installed state, not a constant success message.
with expected_columns(table_name,column_name,type_oid,required_not_null) as (values
  ('materials','document_kind','text'::regtype::oid,true),
  ('materials','analysis_status','text'::regtype::oid,true),
  ('materials','analyzed_pages','integer[]'::regtype::oid,true),
  ('conversation_threads','course_id','text'::regtype::oid,false),
  ('conversation_threads','material_id','text'::regtype::oid,false),
  ('conversation_threads','user_id','uuid'::regtype::oid,true),
  ('conversation_threads','id','uuid'::regtype::oid,true),
  ('concept_evidence','course_id','text'::regtype::oid,true),
  ('concept_evidence','material_id','text'::regtype::oid,true),
  ('concept_evidence','user_id','uuid'::regtype::oid,true)
), rpc_signatures(signature) as (values
  ('public.append_conversation_message(jsonb,jsonb)'),
  ('public.record_concept_evidence(jsonb)'),
  ('public.commit_source_document(text,text,integer,jsonb)'),
  ('public.begin_academic_cleanup(text,text)'),
  ('public.finish_academic_cleanup(uuid)'),
  ('public.search_material_chunks_v2(text,text,text,integer)')
), private_signatures(signature) as (values
  ('public.academic_blob_manifest(uuid,text,text)'),
  ('public.guard_academic_delete()'), ('public.guard_academic_write()'),
  ('public.guard_cleanup_storage_write()'), ('public.guard_cleanup_conversation_write()'),
  ('public.touch_conversation_thread()'), ('public.recompute_concept_state(uuid,text,text)'),
  ('public.evidence_updates_state()')
), expected_fks(table_name,columns,ref_table,ref_columns) as (values
  ('public.conversation_threads',array['user_id','course_id'],'public.courses',array['user_id','id']),
  ('public.conversation_threads',array['user_id','course_id','material_id'],'public.materials',array['user_id','course_id','id']),
  ('public.conversation_messages',array['user_id','thread_id'],'public.conversation_threads',array['user_id','id']),
  ('public.concept_evidence',array['user_id','course_id','material_id'],'public.materials',array['user_id','course_id','id']),
  ('public.concept_evidence',array['user_id','course_id','thread_id'],'public.conversation_threads',array['user_id','course_id','id']),
  ('public.concept_evidence',array['user_id','thread_id','message_id'],'public.conversation_messages',array['user_id','thread_id','id'])
), manifest_definition as (
  select to_regprocedure('public.academic_blob_manifest(uuid,text,text)') as function_id
), checks(check_name,passed) as (
  select '014 completed atomically',coalesce(obj_description(function_id,'pg_proc')=
    'Nexo014 atomic source recovery; owner/course/material use positional SQL arguments.',false) from manifest_definition
  union all select 'Storage arguments fixed',coalesce(
    position('t.user_id=$1' in pg_get_functiondef(function_id))>0
    and position('t.course_id=$2' in pg_get_functiondef(function_id))>0
    and position('t.material_id=$3' in pg_get_functiondef(function_id))>0,false) from manifest_definition
  union all select 'PDF and academic column types',not exists(
    select 1 from expected_columns x where not exists(select 1 from pg_attribute a
      where a.attrelid=to_regclass('public.'||x.table_name) and a.attname=x.column_name and not a.attisdropped
        and a.atttypid=x.type_oid and (not x.required_not_null or a.attnotnull)))
  union all select 'Authenticated RPCs installed',not exists(select 1 from rpc_signatures
    where to_regprocedure(signature) is null or not coalesce(has_function_privilege('authenticated',to_regprocedure(signature),'EXECUTE'),false))
  union all select 'Private helpers restricted',not exists(select 1 from private_signatures
    where to_regprocedure(signature) is null
      or coalesce(has_function_privilege('anon',to_regprocedure(signature),'EXECUTE'),true)
      or coalesce(has_function_privilege('authenticated',to_regprocedure(signature),'EXECUTE'),true))
  union all select 'Four private buckets',not exists(select 1 from (values
    ('study-pdfs'),('solution-images'),('conversation-images'),('study-sources')) x(id)
    where not exists(select 1 from storage.buckets b where b.id=x.id and b.public=false))
  union all select 'Academic RLS enabled',not exists(select 1 from (values
    ('materials'),('conversation_threads'),('conversation_messages'),('concept_evidence'),('academic_cleanup_jobs')) x(name)
    where not exists(select 1 from pg_class c where c.oid=to_regclass('public.'||x.name) and c.relrowsecurity))
  union all select 'Owner context FKs validated',not exists(select 1 from expected_fks x where not exists(
    select 1 from pg_constraint k where k.conrelid=to_regclass(x.table_name) and k.confrelid=to_regclass(x.ref_table)
      and k.contype='f' and k.convalidated and k.conkey=array(
        select a.attnum from unnest(x.columns) with ordinality u(name,n) join pg_attribute a
          on a.attrelid=to_regclass(x.table_name) and a.attname=u.name and not a.attisdropped order by u.n
      )::smallint[] and k.confkey=array(
        select a.attnum from unnest(x.ref_columns) with ordinality u(name,n) join pg_attribute a
          on a.attrelid=to_regclass(x.ref_table) and a.attname=u.name and not a.attisdropped order by u.n
      )::smallint[]))
  union all select 'Cleanup guards installed',not exists(select 1 from (values
    ('public.courses','academic_course_delete_guard'),('public.materials','academic_material_delete_guard'),
    ('public.courses','academic_write_guard'),('public.materials','academic_write_guard'),
    ('storage.objects','academic_storage_write_guard'),
    ('public.conversation_threads','academic_conversation_write_guard'),('public.conversation_messages','academic_message_write_guard')
  ) x(table_name,trigger_name) where not exists(select 1 from pg_trigger t
    where t.tgrelid=to_regclass(x.table_name) and t.tgname=x.trigger_name and not t.tgisinternal and t.tgenabled in ('O','A')))
)
select check_name,case when passed then 'OK' else 'REVISAR' end as status from checks;
-- Nine rows, all OK. SQL Editor uses elevated privileges; real A/B API/Storage checks remain separate.
