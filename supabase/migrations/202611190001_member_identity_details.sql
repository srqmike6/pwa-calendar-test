-- MACH SFRG Events: member identity details for access review
-- Apply after 202611180001_auth_workflows.sql.

alter table public.member_profiles
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists section_work_center text;

-- Capture the registration details supplied in Supabase Auth user metadata.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.member_profiles (
    id, email, display_name, first_name, last_name, section_work_center
  )
  values (
    new.id,
    new.email,
    coalesce(
      nullif(trim(coalesce(new.raw_user_meta_data ->> 'first_name', '') || ' ' || coalesce(new.raw_user_meta_data ->> 'last_name', '')), ''),
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name'
    ),
    nullif(trim(new.raw_user_meta_data ->> 'first_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'last_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'section_work_center'), '')
  )
  on conflict (id) do update
    set email = excluded.email,
        first_name = coalesce(public.member_profiles.first_name, excluded.first_name),
        last_name = coalesce(public.member_profiles.last_name, excluded.last_name),
        section_work_center = coalesce(public.member_profiles.section_work_center, excluded.section_work_center),
        display_name = coalesce(public.member_profiles.display_name, excluded.display_name);
  return new;
end;
$$;
