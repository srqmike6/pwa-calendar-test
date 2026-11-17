# Supabase setup — MACH SFRG Events

This repository is being prepared to use Supabase for shared event data, member access, and event photos. The existing dashboard is intentionally preserved while the backend is added in stages.

## 1. Apply the database migration

1. Open the Supabase project.
2. In the left sidebar, open **SQL Editor**.
3. Choose **New query**.
4. Open `supabase/migrations/202611170001_initial_schema.sql` in this repository and copy its complete contents into the SQL Editor.
5. Click **Run**.
6. Confirm the query completes successfully.

The migration creates:
- `member_profiles` — member/admin role and approval status
- `events` — shared event records
- `access_requests` — requests from people who do not have the shared access code
- `event-photos` — a private Storage bucket
- Row Level Security policies for member reads and admin-only event management

## 2. Configure the first administrator

After the first administrator account has been created through the app's future sign-in flow and email verification is complete, run this in the SQL Editor, replacing the email with the exact administrator email:

```sql
update public.member_profiles
set role = 'admin',
    access_status = 'approved',
    approved_at = now(),
    access_code_redeemed_at = coalesce(access_code_redeemed_at, now())
where lower(email) = lower('YOUR-ADMIN-EMAIL');
```

Run this only for the person who should be the initial administrator. Do not make every member an admin.

## 3. Secrets and access code

- The Supabase Project URL and publishable key may be used by the browser app.
- Never put a Supabase secret/service-role key or database password in browser code, GitHub, or a public environment variable.
- The shared MACH SFRG access code must be checked server-side (for example, by a Supabase Edge Function using a Supabase secret). Never hard-code the code in HTML or JavaScript.
- The database stores whether the user redeemed the code, not the code itself.
- Users who do not have the code can submit an access request for an admin to review.

## 4. Important current status

This migration is the database/security foundation only. The existing browser app still uses local browser storage until the next implementation step connects sign-in, event CRUD, and photo upload to Supabase. Do not treat the app as multi-user until that integration has been completed and tested.
