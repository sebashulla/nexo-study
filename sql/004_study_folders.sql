-- Nexo Study · Migration 004
-- User folders for organizing courses. Courses are still client-side in V0.6,
-- so course_key stores the stable course id and can later map to a DB course id.

create table if not exists public.study_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  emoji text not null default '📁',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists study_folders_user_name_unique
on public.study_folders (user_id, lower(name));

create index if not exists study_folders_user_created_idx
on public.study_folders (user_id, created_at);

create table if not exists public.folder_courses (
  folder_id uuid not null references public.study_folders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  course_key text not null,
  created_at timestamptz not null default now(),
  primary key (folder_id, course_key),
  unique (user_id, course_key)
);

alter table public.study_folders enable row level security;
alter table public.folder_courses enable row level security;

drop policy if exists "study_folders_select_own" on public.study_folders;
create policy "study_folders_select_own" on public.study_folders
for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "study_folders_insert_own" on public.study_folders;
create policy "study_folders_insert_own" on public.study_folders
for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "study_folders_update_own" on public.study_folders;
create policy "study_folders_update_own" on public.study_folders
for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "study_folders_delete_own" on public.study_folders;
create policy "study_folders_delete_own" on public.study_folders
for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "folder_courses_select_own" on public.folder_courses;
create policy "folder_courses_select_own" on public.folder_courses
for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "folder_courses_insert_own" on public.folder_courses;
create policy "folder_courses_insert_own" on public.folder_courses
for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.study_folders f
    where f.id = folder_id and f.user_id = (select auth.uid())
  )
);

drop policy if exists "folder_courses_update_own" on public.folder_courses;
create policy "folder_courses_update_own" on public.folder_courses
for update to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.study_folders f
    where f.id = folder_id and f.user_id = (select auth.uid())
  )
);

drop policy if exists "folder_courses_delete_own" on public.folder_courses;
create policy "folder_courses_delete_own" on public.folder_courses
for delete to authenticated using ((select auth.uid()) = user_id);

create or replace function public.touch_study_folder_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists study_folders_set_updated_at on public.study_folders;
create trigger study_folders_set_updated_at
before update on public.study_folders
for each row execute procedure public.touch_study_folder_updated_at();

grant select, insert, update, delete on public.study_folders to authenticated;
grant select, insert, update, delete on public.folder_courses to authenticated;
