# Comet Study

A private, course-aware study companion for UT Dallas students. Independent student project; not an official university service.

Live at https://cometstudy.tech

## The signed-in app

Signed-in students land on `/dashboard` (the landing page is for guests). The app shell links to:

- **Assistant** (`/assistant`, and an Assistant tab in each group): Claude with read access to exactly what the signed-in student can see — their groups, courses, sessions, exam dates, free rooms and shared library. It can rank the times a group could actually meet (from members' saved free hours minus their classes, avoiding what's already booked), suggest a free campus room for each, and schedule the session once the student picks one. It reads text, Markdown, CSV, PDF and image files from the library to answer from the group's own notes. Needs `ANTHROPIC_API_KEY`; without it the page says so.
- **Home** (`/dashboard`): the next session with RSVP, a "needs you" list (invites, join requests, RSVPs, exam confirmations, courses without a group), the next 7 days, rooms free right now, groups, courses, exams and recent library uploads.
- **Calendar** (`/calendar`): week and month views of class meetings (from section schedules), group sessions and exams; `.ics` export.
- **Groups** (`/groups`, `/groups/new`, `/groups/[id]`): join, request, invite, approve; each group has Overview, Sessions, Library, Exams, Members and Settings.
- **Find matches** (`/match`): groups and classmates ranked by shared free time, study style and goals (deterministic, versioned score; reasons never reveal schedules).
- **Rooms** (`/rooms`): free rooms from Nebula's CourseBook, Ad Astra and Mazevo feeds, with the availability disclaimer.
- **Library** (`/library`): files (4 MB, magic-byte checked, stored in Postgres) and links shared inside groups; only active members can download.
- **Courses** and **Profile** (`/courses`, `/profile`): courses, name, study style, goals and a weekly availability grid.

Mutations are Server Actions in `app/(app)/actions.ts`; domain logic lives in `lib/`. The assistant is the exception: it streams from `app/api/v1/assistant/chat/route.ts`, and its tools call the same `lib/` functions the pages do, so membership checks and limits apply unchanged. Conversations are not stored.

## Architecture and contributing

Next.js App Router, TypeScript, PostgreSQL, Drizzle, Zod, Vitest, Playwright. Never supply real student data or secrets in issues or source control.

## Install and preview

Use Node 24.13.1 and npm 11.8.0. From the repository root:

```sh
npm ci
npx playwright install chromium
npm run dev
```

Open http://localhost:3000 . The landing page refreshes on source changes. Previewing the landing page does not require a database; readiness correctly fails without configured dependencies.

### Working sign-in locally

```sh
npm run db:dev   # persistent embedded PostgreSQL in .data/, migrates, wires .env
npm run dev
```

Set `ANTHROPIC_API_KEY` to turn the study assistant on. With `DATA_MODE=live` and a `NEBULA_API_KEY`, course search and sections use the UTD catalog from Nebula Labs; `npm run catalog:sync` refreshes the cached catalog (it also syncs on first search). New accounts go through `/welcome` (name → courses) before the personalized home page.

`db:dev` sets `EMAIL_PROVIDER=console`, so the one-time sign-in link is printed in the dev server console (`[comet-study] sign-in link for …`). Open it to land on `/account`. `npm run db:dev -- stop` stops the cluster. For real email set `EMAIL_PROVIDER=resend` (or `sendgrid`) with its API key and `EMAIL_FROM`.

### Previewing on other devices

```sh
cloudflared tunnel --url http://localhost:3000
```

Share the printed `*.trycloudflare.com` link. `next.config.ts` allows those origins for the dev server.

## Database and production-shaped startup

Copy `.env.example` to the ignored `.env`, provide a PostgreSQL URL for a dedicated development database and a securely generated AUTH_SECRET of at least 32 characters. Set APP_URL to the exact local origin. Keep DATA_MODE and EMAIL_PROVIDER disabled until their adapters are implemented. No external API key is needed for the foundation. Never use a production database for tests or demos.

```sh
npm run env:check
npm run db:migrate
# Explicitly opt in with DEMO_SEED=1 in the environment before this command:
npm run db:seed
npm run build
```

The foundation seed inserts only a fictional marker to verify migration/seed behavior. It does not yet create the required full-product demo dataset. Production startup requires NODE_ENV=production, an HTTPS APP_URL, and rejects fixture/console adapters. Use a TLS reverse proxy or hosting provider for real production serving.

After configuring that HTTPS origin, `npm start` validates production settings and starts the built application. It rejects the local HTTP APP_URL in the development example. For a self-contained local production-build test, use `npm run test:e2e`; the test wrapper supplies isolated configuration automatically.

## Verification

```sh
npm run format:check
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration
npm run test:security
npm run test:e2e
npm run test:a11y
```

Integration/browser wrappers create an isolated real PostgreSQL database and clean it up. They generate their own test configuration and do not use your DATABASE_URL. On Windows, an elevated host requires the restricted-token launch used by the wrapper. CI can supply TEST_POSTGRES_ADMIN_URL for a disposable PostgreSQL service; the wrapper creates and drops only its uniquely named database. Browser tests run a production build on port 3100. Leave that port free; development preview uses port 3000.

`npm test` runs the deterministic suites; `npm run verify` additionally runs static checks and build.
