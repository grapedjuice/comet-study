# Operations

Deployed 2026-09-24 at https://comet-study.vercel.app (Vercel Hobby, project `comet-study`, region iad1) from https://github.com/grapedjuice/comet-study. Every push to `main` deploys to production; other branches get preview URLs.

- Database: Neon Postgres via the Vercel Marketplace (`comet-study-db`); `DATABASE_URL` is injected by the integration.
- Migrations run in the build (`vercel.json` buildCommand: `npm run db:migrate && npm run build`). Previews share the production database, so migrations must stay forward-compatible.
- Secrets (`AUTH_SECRET`, `CRON_SECRET`, `NEBULA_API_KEY`) are stored as sensitive Vercel env vars for production and preview. `APP_URL=https://comet-study.vercel.app`, `DATA_MODE=live`.
- Email: `EMAIL_PROVIDER=gmail` (production only) sends sign-in links through Gmail SMTP using `GMAIL_USER` + `GMAIL_APP_PASSWORD` (sensitive), about 500/day. Previews keep `EMAIL_PROVIDER=disabled`. With a domain later, switch to `resend` (`RESEND_API_KEY`, `EMAIL_FROM`).
- Catalog: Vercel Cron calls `/api/v1/cron/catalog` Mondays 09:00 UTC with `CRON_SECRET`; searches also refresh it when older than 7 days.

## Required production controls

A release operator must configure independent production secrets, a managed PostgreSQL database, verified email sender and rotated Nebula key. Never point test runners at production. No automated demo seeding on startup.

Deploy migrations as a reviewed release step. Back up before schema changes; prefer forward corrective migrations. Reverting application code is allowed only when schema compatibility is established. Destructive migration rollback requires snapshot restore in an isolated recovery environment, row-count/invariant verification and an explicit cutover decision.

Health live indicates the application process is responsive; health ready must fail on unavailable database or missing migration. Restrict detailed internal diagnostics; public health responses must not include credentials or connection strings.

## Unverified operational gates

Managed database backups and restore drill; alert delivery; job dead-letter monitoring; runtime metrics; security header deployment; production email, storage/scanning and push; DNS/TLS; preview and production isolation; deployment rollback. None has been verified yet. Do not deploy this checkpoint as a completed student application.

