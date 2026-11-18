-- MACH SFRG Events: auth workflow hardening
-- Apply after 202611170001_initial_schema.sql.

-- Keep profile email current when a member changes their auth email.
create or replace function public.sync_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.member_profiles
  set email = new.email
  where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_updated_profile on auth.users;
create trigger on_auth_user_updated_profile
after update of email on auth.users
for each row
when (old.email is distinct from new.email)
execute function public.sync_auth_user_profile();

-- Idempotent request submission; a denied applicant may submit a fresh request.
create or replace function public.submit_access_request(p_message text default null)
returns public.access_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_request public.access_requests;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  insert into public.access_requests (user_id, message, status, requested_at, reviewed_at, reviewed_by)
  values (v_user_id, nullif(left(trim(coalesce(p_message, '')), 1000), ''), 'pending', now(), null, null)
  on conflict (user_id) do update
    set message = excluded.message,
        status = 'pending',
        requested_at = now(),
        reviewed_at = null,
        reviewed_by = null
  returning * into v_request;

  return v_request;
end;
$$;

-- One atomic admin action updates both the request and the member's access.
create or replace function public.review_access_request(
  p_request_id uuid,
  p_decision text
)
returns public.access_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.access_requests;
  v_user_id uuid;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Administrator access required';
  end if;
  if p_decision not in ('approved', 'denied') then
    raise exception 'Decision must be approved or denied';
  end if;

  select user_id into v_user_id
  from public.access_requests
  where id = p_request_id
  for update;

  if v_user_id is null then
    raise exception 'Access request not found';
  end if;

  update public.member_profiles
  set access_status = p_decision,
      approved_at = case when p_decision = 'approved' then now() else null end,
      approved_by = case when p_decision = 'approved' then auth.uid() else null end
  where id = v_user_id;

  update public.access_requests
  set status = p_decision,
      reviewed_at = now(),
      reviewed_by = auth.uid()
  where id = p_request_id
  returning * into v_request;

  return v_request;
end;
$$;

revoke all on function public.submit_access_request(text) from public;
revoke all on function public.review_access_request(uuid, text) from public;
grant execute on function public.submit_access_request(text) to authenticated;
grant execute on function public.review_access_request(uuid, text) to authenticated;
