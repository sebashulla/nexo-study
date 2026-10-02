-- Nexo Study V0.9.3. Apply after 008; historical migrations stay unchanged.
begin;

create or replace function public.valid_solution_attachments(value jsonb, owner_id uuid, course_key text, solution_id uuid)
returns boolean language plpgsql immutable set search_path = public as $$
declare attachment jsonb;
begin
  if jsonb_typeof(value) <> 'array' or jsonb_array_length(value) > 4 then return false; end if;
  for attachment in select jsonb_array_elements(value) loop
    if jsonb_typeof(attachment) <> 'object'
      or not (attachment ?& array['storagePath', 'mimeType', 'name', 'bytes'])
      or attachment - array['storagePath', 'mimeType', 'name', 'bytes'] <> '{}'::jsonb
      or jsonb_typeof(attachment->'storagePath') <> 'string'
      or jsonb_typeof(attachment->'name') <> 'string'
      or jsonb_typeof(attachment->'mimeType') <> 'string'
      or char_length(attachment->>'name') > 240
      or attachment->>'mimeType' not in ('image/png', 'image/jpeg', 'image/webp')
      or jsonb_typeof(attachment->'bytes') <> 'number'
      or (attachment->>'bytes')::numeric not between 1 and 3145728
      or left(attachment->>'storagePath', char_length(owner_id::text || '/' || course_key || '/solutions/' || solution_id::text || '/'))
        <> owner_id::text || '/' || course_key || '/solutions/' || solution_id::text || '/'
    then return false; end if;
  end loop;
  return true;
exception when others then return false;
end;
$$;

create table if not exists public.saved_solutions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  course_id text not null,
  question text not null check (char_length(trim(question)) between 1 and 20000),
  answer text not null check (char_length(trim(answer)) between 1 and 100000),
  category text not null default 'General',
  source text not null default 'resolver' check (source = 'resolver'),
  source_key text not null check (char_length(source_key) between 1 and 240),
  status text not null default 'ready' check (status in ('saving', 'ready')),
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (user_id, course_id) references public.courses(user_id, id) on delete cascade,
  unique (user_id, course_id, source_key),
  check (public.valid_solution_attachments(attachments, user_id, course_id, id))
);
create index if not exists saved_solutions_course_idx on public.saved_solutions(user_id, course_id, created_at desc);
alter table public.saved_solutions enable row level security;
drop policy if exists saved_solutions_owner on public.saved_solutions;
create policy saved_solutions_owner on public.saved_solutions for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.saved_solutions to authenticated;
drop trigger if exists saved_solutions_touch_updated_at on public.saved_solutions;
create trigger saved_solutions_touch_updated_at before update on public.saved_solutions
  for each row execute procedure public.touch_learning_workspace_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('solution-images', 'solution-images', false, 3145728, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists solution_images_owner_select on storage.objects;
create policy solution_images_owner_select on storage.objects for select to authenticated
using (bucket_id = 'solution-images' and (storage.foldername(name))[1] = (select auth.uid())::text
  and (storage.foldername(name))[3] = 'solutions'
  and exists (select 1 from public.saved_solutions s where s.user_id = (select auth.uid())
    and s.course_id = (storage.foldername(name))[2] and s.id::text = (storage.foldername(name))[4]));
drop policy if exists solution_images_owner_insert on storage.objects;
create policy solution_images_owner_insert on storage.objects for insert to authenticated
with check (bucket_id = 'solution-images' and (storage.foldername(name))[1] = (select auth.uid())::text
  and (storage.foldername(name))[3] = 'solutions'
  and exists (select 1 from public.saved_solutions s where s.user_id = (select auth.uid())
    and s.course_id = (storage.foldername(name))[2] and s.id::text = (storage.foldername(name))[4]));
drop policy if exists solution_images_owner_delete on storage.objects;
create policy solution_images_owner_delete on storage.objects for delete to authenticated
using (bucket_id = 'solution-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
-- Objects are immutable: replacement uses a new path, so no UPDATE policy is required.
commit;
