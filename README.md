# Comet Study

A private, course-aware study companion for UT Dallas students. Independent student project; not an official university service.

## Build status

Active implementation under the supplied production-build specification. **Not production ready.** See [build status](docs/build-status.md) for accepted modules, evidence, and remaining gates. No live integrations or deployment have been verified.

## Architecture and contributing

Next.js App Router, TypeScript, PostgreSQL, Drizzle, Zod, Vitest, Playwright. Never supply real student data or secrets in issues or source control.

## Install and preview

Use Node 24.13.1 and npm 11.8.0. From the repository root:

```sh
npm ci
npx playwright install chromium
npm run dev
```

Open http://localhost:3000 . The landing page refreshes on source changes. No student login or live campus integration exists in this checkpoint. Previewing the landing page does not require a database; readiness correctly fails without configured dependencies.

## Database and production-shaped startup

Copy `.env.example` to the ignored `.env`, provide a PostgreSQL URL for a dedicated development database and a securely generated AUTH_SECRET of at least 32 characters. Set APP_URL to the exact local origin. Keep DATA_MODE and EMAIL_PROVIDER disabled until their adapters are implemented. No external API key is needed for the foundation. Never use a production database for tests or demos.

```sh
npm run env:check
npm run db:migrate
# Explicitly opt in with DEMO_SEED=1 in the environment before this command:
npm run db:seed
npm run build
```

The foundation seed inserts only a fictional marker to verify migration/seed behavior. It does not yet create the required full-product demo dataset. Production startup requires NODE_ENV=production, an HTTPS APP_URL, and rejects fixture/console adapters. Use a TLS reverse proxy or hosting provider for real production serving. Production deployment remains blocked by unfinished product modules and release gates.

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

`npm test` runs the implemented deterministic suites; `npm run verify` additionally runs static checks and build. Passing these commands covers the implemented foundation only. See [test matrix](docs/test-matrix.md) for the required product flows still missing.

- [Architecture](docs/architecture.md)
- [Security](docs/security.md)
- [Data sources](docs/data-sources.md)
- [Implementation plan](docs/plans/tranche-1.md)
