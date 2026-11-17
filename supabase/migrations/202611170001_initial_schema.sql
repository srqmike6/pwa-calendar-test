-- MACH SFRG Events: initial Supabase schema
-- Apply this file in Supabase SQL Editor.
-- The shared access code is NOT stored here. Validate it in a server-side
-- Edge Function using a Supabase secret, then set access_code_redeemed_at
-- and access_status='approved' for the authenticated user.

create extension if not exists pgcrypto;

create table if not exists public.member_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  role text not null default 'member' check (role in ('member', 'admin')),
  access_status text not null default 'pending' check (access_status in ('pending', 'approved', 'denied')),
  access_code_redeemed_at timestamptz,
  approved_at timestamptz,
  approved_by uuid references public.member_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  event_date date not null,
  start_time time,
  end_time time,
  category text not null default 'Community',
  location text,
  signup_url text,
  description text,
  photo_path text,
  created_by uuid references public.member_profiles(id) on delete set null,
  updated_by uuid references public.member_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_end_after_start check (
    start_time is null or end_time is null or end_time > start_time
  )
);

create table if not exists public.access_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  message text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.member_profiles(id) on delete set null
);

create index if not exists events_event_date_idx on public.events(event_date);
create index if not exists access_requests_status_idx on public.access_requests(status);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists member_profiles_set_updated_at on public.member_profiles;
create trigger member_profiles_set_updated_at
before update on public.member_profiles
for each row execute function public.set_updated_at();

drop trigger if exists events_set_updated_at on public.events;
create trigger events_set_updated_at
before update on public.events
for each row execute function public.set_updated_at();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.member_profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')
  )
  on conflict (id) do update
    set email = excluded.email,
        display_name = coalesce(public.member_profiles.display_name, excluded.display_name);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row execute function public.handle_new_auth_user();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.member_profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
      and p.access_status = 'approved'
  );
$$;

create or replace function public.is_approved_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.member_profiles p
    where p.id = (select auth.uid())
      and p.access_status = 'approved'
  );
$$;

alter table public.member_profiles enable row level security;
alter table public.events enable row level security;
alter table public.access_requests enable row level security;

drop policy if exists "Members can read their own profile; admins can read all" on public.member_profiles;
create policy "Members can read their own profile; admins can read all"
on public.member_profiles for select to authenticated
using (id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "Admins can update member profiles" on public.member_profiles;
create policy "Admins can update member profiles"
on public.member_profiles for update to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

drop policy if exists "Approved members can read events" on public.events;
create policy "Approved members can read events"
on public.events for select to authenticated
using ((select public.is_approved_member()));

drop policy if exists "Admins can insert events" on public.events;
create policy "Admins can insert events"
on public.events for insert to authenticated
with check ((select public.is_admin()));

drop policy if exists "Admins can update events" on public.events;
create policy "Admins can update events"
on public.events for update to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

drop policy if exists "Admins can delete events" on public.events;
create policy "Admins can delete events"
on public.events for delete to authenticated
using ((select public.is_admin()));

drop policy if exists "Users can read their own access request; admins can read all" on public.access_requests;
create policy "Users can read their own access request; admins can read all"
on public.access_requests for select to authenticated
using (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "Users can submit their own access request" on public.access_requests;
create policy "Users can submit their own access request"
on public.access_requests for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "Admins can review access requests" on public.access_requests;
create policy "Admins can review access requests"
on public.access_requests for update to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

-- Event photos are private. Approved members can view them; admins manage them.
insert into storage.buckets (id, name, public)
values ('event-photos', 'event-photos', false)
on conflict (id) do update set public = false;

drop policy if exists "Approved members can view event photos" on storage.objects;
create policy "Approved members can view event photos"
on storage.objects for select to authenticated
using (bucket_id = 'event-photos' and (select public.is_approved_member()));

drop policy if exists "Admins can upload event photos" on storage.objects;
create policy "Admins can upload event photos"
on storage.objects for insert to authenticated
with check (bucket_id = 'event-photos' and (select public.is_admin()));

drop policy if exists "Admins can update event photos" on storage.objects;
create policy "Admins can update event photos"
on storage.objects for update to authenticated
using (bucket_id = 'event-photos' and (select public.is_admin()))
with check (bucket_id = 'event-photos' and (select public.is_admin()));

drop policy if exists "Admins can delete event photos" on storage.objects;
create policy "Admins can delete event photos"
on storage.objects for delete to authenticated
using (bucket_id = 'event-photos' and (select public.is_admin()));

grant usage on schema public to authenticated;
grant select, update on public.member_profiles to authenticated;
grant select, insert, update, delete on public.events to authenticated;
grant select, insert, update on public.access_requests to authenticated;
