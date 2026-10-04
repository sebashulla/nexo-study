-- Read-only checks after the WHOLE 013 recovery. No private content or credentials.
select table_name,column_name,data_type,is_nullable
from information_schema.columns
where table_schema='public' and (
  (table_name='materials' and column_name in ('id','course_id','document_kind','analysis_status','analyzed_pages'))
  or (table_name in ('conversation_threads','concept_evidence') and column_name in ('id','user_id','course_id','material_id','workspace_id','thread_id','message_id'))
)
order by table_name,ordinal_position;

select name,case when to_regprocedure(signature) is not null then 'OK' else 'MISSING' end as status
from (values
  ('PDF search','public.search_material_chunks_v2(text,text,text,integer)'),
  ('Conversation append','public.append_conversation_message(jsonb,jsonb)'),
  ('Practice evidence','public.record_concept_evidence(jsonb)'),
  ('Normalized source save','public.commit_source_document(text,text,integer,jsonb)'),
  ('Begin cleanup','public.begin_academic_cleanup(text,text)'),
  ('Finish cleanup','public.finish_academic_cleanup(uuid)')
) as expected(name,signature);

select name,public as is_public,file_size_limit
from storage.buckets where id in ('study-pdfs','solution-images','conversation-images','study-sources') order by id;
-- Four rows; is_public=false on every row.

select relname as table_name,relrowsecurity as rls_enabled
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and relname in ('materials','conversation_threads','conversation_messages','concept_evidence','academic_cleanup_jobs');
-- Five rows; rls_enabled=true on every row.

select conrelid::regclass as table_name,conname,convalidated,pg_get_constraintdef(oid) as definition
from pg_constraint where
  (conrelid=to_regclass('public.materials') and conname in ('materials_page_count_nonnegative','materials_document_kind_check','materials_analysis_status_check','materials_analyzed_pages_check'))
  or (conrelid in (to_regclass('public.conversation_threads'),to_regclass('public.concept_evidence')) and contype='f')
order by conrelid::regclass::text,conname;

with installed as (
  select pg_get_functiondef(to_regprocedure('public.academic_blob_manifest(uuid,text,text)')) as definition
)
select 'Storage parameter shadowing fix' as check_name,case
  when definition is null then 'MISSING'
  when position('t.user_id=$1' in definition)>0 and position('t.course_id=$2' in definition)>0
    and position('t.material_id=$3' in definition)>0 then 'OK'
  else 'OUTDATED: run the complete 013 recovery'
end as status from installed;
-- Must return OK. Function existence alone does not prove the old collision is fixed.
-- SQL Editor is elevated; real authenticated A/B RLS and Storage HTTP remain separate checks.
