-- Nexo Study V0.9.6. Additive migration; apply after 009.
begin;

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
commit;
