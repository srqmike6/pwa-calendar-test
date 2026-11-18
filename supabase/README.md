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


## 5. Apply the auth workflow update

After the initial schema migration, run `supabase/migrations/202611180001_auth_workflows.sql` in the Supabase SQL Editor. It adds:
- Profile email synchronization when an auth email changes.
- A safe, repeatable access-request function (including reapplication after denial).
- An atomic administrator review function that updates the request and member approval together.

## 6. Deploy the shared access-code function

The browser never receives the shared access code or a service-role key. Deploy the Edge Function in `supabase/functions/redeem-access-code/index.ts` using the Supabase CLI from the repository root:

```sh
supabase functions deploy redeem-access-code
supabase secrets set MACH_ACCESS_CODE="your-real-shared-code"
```

Use your actual shared code in your local terminal only. Do not put it in GitHub, this README, the browser config, or a ChatGPT message. Supabase supplies the project URL and service-role environment variables to the Edge Function runtime. The function verifies the signed-in user's token before approving that user's profile.

## 7. First administrator

Create the first account through the app and confirm its email. Then run the administrator bootstrap SQL from section 2, replacing the placeholder with the exact email used for that account. The first administrator can then approve or decline access requests and manage events.

## 8. App configuration and data

- `public/config.js` contains only the Supabase project URL and publishable key. The publishable key is intended for browser use; Row Level Security protects the data.
- Events are now intended to be stored in the shared `public.events` table. Event photos are uploaded to the private `event-photos` bucket.
- The app does not import the old browser-local event. The shared calendar starts empty.
- Ordinary approved members can browse events; only approved administrators can create, edit, or delete them.
- Deploy this branch only after the SQL update and Edge Function are deployed. The app will not allow access-code redemption until the Edge Function exists.
