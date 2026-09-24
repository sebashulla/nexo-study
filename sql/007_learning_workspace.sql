-- Nexo Study V0.9 · Learning Workspace.
-- Keep the legacy text IDs so folder_courses.course_key and local browser data remain valid.
-- Apply after 006. Academic content belongs only to its owner; is_admin grants no access.

create table if not exists public.courses (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  name text not null check (char_length(trim(name)) between 1 and 180),
  emoji text not null default '📘',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.materials (
  user_id uuid not null,
  course_id text not null,
  id text not null,
  title text not null check (char_length(trim(title)) between 1 and 240),
  content text not null default '',
  source_type text not null default 'text' check (source_type in ('text', 'pdf')),
  source_name text,
  page_count integer check (page_count is null or page_count between 0 and 250),
  pages jsonb not null default '[]'::jsonb check (jsonb_typeof(pages) = 'array'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  storage_path text,
  processing_status text not null default 'ready' check (processing_status in ('queued', 'processing', 'ready', 'failed')),
  study_pack jsonb,
  study_pack_meta jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  unique (user_id, course_id, id),
  foreign key (user_id, course_id) references public.courses(user_id, id) on delete cascade
);
create index if not exists materials_course_created_idx on public.materials(user_id, course_id, created_at);

create table if not exists public.material_chunks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  course_id text not null,
  material_id text not null,
  page_start integer not null check (page_start > 0),
  page_end integer not null check (page_end >= page_start),
  content text not null check (char_length(content) between 1 and 12000),
  keywords text[] not null default '{}',
  created_at timestamptz not null default now(),
  foreign key (user_id, course_id, material_id) references public.materials(user_id, course_id, id) on delete cascade
);
create index if not exists material_chunks_lookup_idx on public.material_chunks(user_id, course_id, material_id, page_start);

create table if not exists public.material_topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  course_id text not null,
  material_id text not null,
  title text not null,
  summary text not null default '',
  page_start integer check (page_start is null or page_start > 0),
  page_end integer check (page_end is null or page_end >= page_start),
  keywords text[] not null default '{}',
  created_at timestamptz not null default now(),
  foreign key (user_id, course_id, material_id) references public.materials(user_id, course_id, id) on delete cascade
);
create index if not exists material_topics_lookup_idx on public.material_topics(user_id, course_id, material_id, page_start);

create table if not exists public.study_artifacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  course_id text not null,
  source_material_id text not null,
  type text not null check (type in ('summary', 'flashcards', 'multiple_choice', 'written_questions', 'fill_blanks', 'notes', 'exam')),
  status text not null default 'queued' check (status in ('queued', 'processing', 'ready', 'failed')),
  payload jsonb not null default '{}'::jsonb,
  error_message text,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, source_material_id, type, version),
  foreign key (user_id, course_id, source_material_id) references public.materials(user_id, course_id, id) on delete cascade
);
create index if not exists study_artifacts_lookup_idx on public.study_artifacts(user_id, course_id, source_material_id, type, status);

create table if not exists public.study_progress (
  user_id uuid not null,
  course_id text not null,
  material_id text not null,
  activity jsonb not null default '{}'::jsonb check (jsonb_typeof(activity) = 'object'),
  updated_at timestamptz not null default now(),
  primary key (user_id, material_id),
  foreign key (user_id, course_id, material_id) references public.materials(user_id, course_id, id) on delete cascade
);

create table if not exists public.learning_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  course_id text not null,
  material_id text not null,
  concept_key text not null,
  concept_label text not null,
  status text not null default 'unknown' check (status in ('unknown', 'learning', 'known', 'mastered')),
  confidence numeric(4, 3) not null default 0 check (confidence between 0 and 1),
  attempts integer not null default 0 check (attempts >= 0),
  correct_attempts integer not null default 0 check (correct_attempts between 0 and attempts),
  updated_at timestamptz not null default now(),
  unique (user_id, material_id, concept_key),
  foreign key (user_id, course_id, material_id) references public.materials(user_id, course_id, id) on delete cascade
);
create index if not exists learning_state_course_idx on public.learning_state(user_id, course_id, status);

create table if not exists public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  course_id text not null,
  objective text not null,
  duration_minutes integer not null check (duration_minutes in (15, 30, 45)),
  status text not null default 'planned' check (status in ('planned', 'active', 'completed')),
  plan jsonb not null default '[]'::jsonb check (jsonb_typeof(plan) = 'array'),
  results jsonb not null default '{}'::jsonb check (jsonb_typeof(results) = 'object'),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  foreign key (user_id, course_id) references public.courses(user_id, id) on delete cascade,
  unique (user_id, id)
);
create index if not exists study_sessions_course_idx on public.study_sessions(user_id, course_id, created_at desc);

create table if not exists public.study_session_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  session_id uuid not null,
  activity_type text not null,
  material_id text,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (user_id, session_id) references public.study_sessions(user_id, id) on delete cascade
);
create index if not exists study_session_events_lookup_idx on public.study_session_events(user_id, session_id, created_at);

-- RLS is deliberately owner-only on every academic table, including admin accounts.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'courses', 'materials', 'material_chunks', 'material_topics', 'study_artifacts',
    'study_progress', 'learning_state', 'study_sessions', 'study_session_events'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_owner', table_name);
    execute format('create policy %I on public.%I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', table_name || '_owner', table_name);
    execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);
  end loop;
end $$;

create or replace function public.touch_learning_workspace_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'courses', 'materials', 'study_artifacts', 'study_progress', 'learning_state'
  ] loop
    execute format('drop trigger if exists %I on public.%I', table_name || '_touch_updated_at', table_name);
    execute format('create trigger %I before update on public.%I for each row execute procedure public.touch_learning_workspace_updated_at()', table_name || '_touch_updated_at', table_name);
  end loop;
end $$;

-- One private bucket. Storage paths: userId/courseId/materialId/original.pdf.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('study-pdfs', 'study-pdfs', false, 26214400, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "study_pdfs_owner_select" on storage.objects;
create policy "study_pdfs_owner_select" on storage.objects for select to authenticated
using (bucket_id = 'study-pdfs' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "study_pdfs_owner_insert" on storage.objects;
create policy "study_pdfs_owner_insert" on storage.objects for insert to authenticated
with check (
  bucket_id = 'study-pdfs'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and storage.filename(name) = 'original.pdf'
  and exists (select 1 from public.materials m where m.user_id = (select auth.uid())
    and m.course_id = (storage.foldername(name))[2] and m.id = (storage.foldername(name))[3])
);
drop policy if exists "study_pdfs_owner_update" on storage.objects;
create policy "study_pdfs_owner_update" on storage.objects for update to authenticated
using (bucket_id = 'study-pdfs' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'study-pdfs' and (storage.foldername(name))[1] = (select auth.uid())::text
  and storage.filename(name) = 'original.pdf'
  and exists (select 1 from public.materials m where m.user_id = (select auth.uid())
    and m.course_id = (storage.foldername(name))[2] and m.id = (storage.foldername(name))[3]));
drop policy if exists "study_pdfs_owner_delete" on storage.objects;
create policy "study_pdfs_owner_delete" on storage.objects for delete to authenticated
using (bucket_id = 'study-pdfs' and (storage.foldername(name))[1] = (select auth.uid())::text);
