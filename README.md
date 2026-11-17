# MACH SFRG Events — Render starter

This is a replacement starter project based on the supplied `server.js` and the
supplied MACH SFRG rendered HTML snapshot. The snapshot identifies the visual
language and home-screen structure (MACH SFRG heading, pale blue/gray surfaces,
teal accents, featured event, category filters, monthly calendar, and upcoming
event cards). It is not the original source project, so this is a functional
recreation rather than a pixel-perfect recovery of the original app.

## Features
- Express app serves the frontend and JSON API from one Render service.
- PostgreSQL persistence for events, authorized users, PIN challenges, and sessions.
- Email PIN login with 10-minute expiry, hashed PINs, limited attempts, and rate limits.
- Admin-only authorized-user management.
- Create, edit, delete, feature, search, and filter events.
- Monthly calendar and upcoming event list.
- Optional event image URL (upload storage is not included yet).

## Render deployment
1. Put the contents of this folder at the root of the GitHub repository (or copy these files into the matching paths).
2. Create/attach a Render PostgreSQL database.
3. Create a Render Web Service from the GitHub repository. Build: `npm install`; Start: `npm start`.
4. Set `DATABASE_URL` to the database's **Internal Database URL**.
5. Set `AUTHORIZED_EMAILS` to the approved comma-separated list. The initial values include `Michael.j.arthur2.mil@health.mil`.
6. Set `ADMIN_EMAILS` to the administrator address(es). At least one admin address must also be authorized.
7. Configure SMTP settings (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`). PIN login intentionally fails closed until SMTP is configured; codes are never printed to logs or returned to the browser.
8. Deploy. Visit `/api/health` to check the service.

`render.yaml` is an optional Blueprint example. If your existing Render service already exists, you can keep it and add the environment variables/database there instead of creating a second service. Review its database plan and service plan before applying the Blueprint.

## Local development
- Install Node.js 20+ and PostgreSQL.
- Copy `.env.example` to `.env`, fill in valid values, and load them with your preferred environment-variable tool (the project does not include dotenv).
- Run `npm install`, then `npm start`.

## Important deployment notes
- Existing Render service needs a PostgreSQL database and `DATABASE_URL`; the previous in-memory session map is not compatible with multiple instances/restarts.
- No SMTP credentials were supplied, so email delivery must be configured before PIN sign-in can work.
- Event images are accepted as external image URLs. Add object storage (e.g. S3/R2) later if direct uploads are required.
- This starter has not been security-audited for production or assessed for handling controlled, sensitive, or government information. Do not enter or store sensitive personal, medical, or operational data until the appropriate security review and hosting approval are complete.
