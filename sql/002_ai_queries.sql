-- Nexo Study · Migration 002
-- Account-scoped history for Resolver / Corrector.

create table if not exists public.ai_queries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task text not null default 'solve' check (task in ('solve', 'review')),
  category text not null default 'General',
  question text not null,
  answer text not null,
  deep boolean not null default false,
  image_count smallint not null default 0 check (image_count between 0 and 4),
  created_at timestamptz not null default now()
);

create index if not exists ai_queries_user_created_idx
on public.ai_queries (user_id, created_at desc);

alter table public.ai_queries enable row level security;

drop policy if exists "ai_queries_select_own" on public.ai_queries;

create policy "ai_queries_select_own"
on public.ai_queries
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "ai_queries_insert_own" on public.ai_queries;

create policy "ai_queries_insert_own"
on public.ai_queries
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "ai_queries_delete_own" on public.ai_queries;

create policy "ai_queries_delete_own"
on public.ai_queries
for delete
to authenticated
using ((select auth.uid()) = user_id);

grant select, insert, delete on public.ai_queries to authenticated;
