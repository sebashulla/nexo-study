-- Nexo Study · Migration 003
-- Profile onboarding: unique username + personalization fields.

alter table public.profiles
  add column if not exists username text,
  add column if not exists person_type text,
  add column if not exists study_area text,
  add column if not exists study_goal text,
  add column if not exists onboarding_completed boolean not null default false;

create unique index if not exists profiles_username_lower_unique
on public.profiles (lower(username))
where username is not null;

create or replace function public.is_username_available(candidate text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    candidate is not null
    and candidate ~ '^[a-z0-9_]{3,20}$'
    and not exists (
      select 1 from public.profiles where lower(username) = lower(candidate)
    );
$$;

grant execute on function public.is_username_available(text) to anon, authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    full_name,
    username,
    person_type,
    study_area,
    study_goal,
    onboarding_completed
  )
  values (
    new.id,
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(lower(new.raw_user_meta_data ->> 'username'), ''),
    nullif(new.raw_user_meta_data ->> 'person_type', ''),
    nullif(new.raw_user_meta_data ->> 'study_area', ''),
    nullif(new.raw_user_meta_data ->> 'study_goal', ''),
    coalesce((new.raw_user_meta_data ->> 'onboarding_completed')::boolean, false)
  )
  on conflict (id) do update set
    full_name = excluded.full_name,
    username = coalesce(public.profiles.username, excluded.username),
    person_type = coalesce(public.profiles.person_type, excluded.person_type),
    study_area = coalesce(public.profiles.study_area, excluded.study_area),
    study_goal = coalesce(public.profiles.study_goal, excluded.study_goal),
    onboarding_completed = public.profiles.onboarding_completed or excluded.onboarding_completed,
    updated_at = now();
  return new;
end;
$$;

-- Recreate the trigger to make the dependency explicit in this migration.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();
