-- Nexo Study · Migration 005
-- Secure beta feedback + admin foundation.
-- IMPORTANT: this migration does NOT promote any account to admin.
-- The owner account will be assigned in a later migration after it exists.

alter table public.profiles
  add column if not exists is_admin boolean not null default false;

-- Adding an admin flag means normal users must NOT retain table-wide UPDATE rights,
-- otherwise they could promote themselves. Keep only the profile fields they own.
revoke update on public.profiles from authenticated;
grant update (
  full_name,
  avatar_url,
  username,
  person_type,
  study_area,
  study_goal,
  onboarding_completed
) on public.profiles to authenticated;

create or replace function public.is_nexo_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select p.is_admin
    from public.profiles p
    where p.id = (select auth.uid())
  ), false);
$$;

grant execute on function public.is_nexo_admin() to authenticated;

drop policy if exists "profiles_admin_select_all" on public.profiles;
create policy "profiles_admin_select_all"
on public.profiles
for select
to authenticated
using (public.is_nexo_admin());

create table if not exists public.feedback_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  feedback_type text not null default 'other' check (feedback_type in ('idea','bug','experience','other')),
  rating smallint check (rating between 1 and 5),
  message text not null check (char_length(message) between 5 and 4000),
  page_context text,
  user_agent text,
  status text not null default 'new' check (status in ('new','reviewing','done')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists feedback_entries_created_idx
on public.feedback_entries (created_at desc);

create index if not exists feedback_entries_status_created_idx
on public.feedback_entries (status, created_at desc);

alter table public.feedback_entries enable row level security;

drop policy if exists "feedback_insert_own" on public.feedback_entries;
create policy "feedback_insert_own"
on public.feedback_entries
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "feedback_admin_select" on public.feedback_entries;
create policy "feedback_admin_select"
on public.feedback_entries
for select
to authenticated
using (public.is_nexo_admin());

drop policy if exists "feedback_admin_update" on public.feedback_entries;
create policy "feedback_admin_update"
on public.feedback_entries
for update
to authenticated
using (public.is_nexo_admin())
with check (public.is_nexo_admin());

drop policy if exists "feedback_admin_delete" on public.feedback_entries;
create policy "feedback_admin_delete"
on public.feedback_entries
for delete
to authenticated
using (public.is_nexo_admin());

create or replace function public.touch_feedback_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists feedback_entries_set_updated_at on public.feedback_entries;
create trigger feedback_entries_set_updated_at
before update on public.feedback_entries
for each row execute procedure public.touch_feedback_updated_at();

grant insert, select, update, delete on public.feedback_entries to authenticated;
