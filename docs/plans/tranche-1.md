# Comet Study implementation plan — tranche 1

Goal: establish a verified runnable foundation, then advance through the mandated vertical modules within the 100-point budget.
Architecture: server-side services, strict REST schemas, PostgreSQL transactions and provider boundaries.
Spec: docs/specification.md (the operator-supplied source, preserved verbatim).

## Global constraints

No real student data. No invented upstream contracts. No fixture adapters at production startup. No premature production-ready claim. API paths under /api/v1. Four total concurrent agents maximum. Follow Section 8.1 module order. All locally runnable checks must pass before acceptance.

## Review focus

- Production env rejects fixture mode, HTTP origin and missing secrets without leaking values.
- Database unavailable or schema outdated returns readiness 503, while live remains 200.
- Test setup never resets a caller-supplied database.
- Private/auth responses must not be cached; malformed inputs do not leak internals.
- Browser keyboard and 320px layout remain usable with service failures.

## Task F1: toolchain, database and health

Owner: foundation worker; files package.json/package-lock.json/configuration, lib/env.ts, lib/db.ts, lib/health.ts, db/**, scripts/**, health routes, tests/unit and tests/integration. Lead retains app/layout.tsx, app/page.tsx, app/globals.css, browser tests and docs. No implementation of later modules.

- [ ] Pin compatible stable packages after registry/doc inspection; strict typecheck, lint, formatting, test and build scripts.
- [ ] Write failing env tests: missing database/auth/origin; no secret values in error; production rejects test adapters and insecure origins.
- [ ] Implement typed environment schema and env:check. Test expected valid/invalid cases.
- [ ] Write readiness tests: healthy database/migrations returns 200, disconnected and stale schema return 503, liveness independent.
- [ ] Implement database schema migration journal, real connection, migration/seed CLI and health handlers.
- [ ] Prove migration from zero and repeat migration against an isolated real PostgreSQL instance; seed guard fails under production.
- [ ] Add CI with Postgres service and install/static/build/browser/security checks.
- [ ] Run npm run verify; save red/green evidence and exact test counts.

## Task F2: browser shell and foundation acceptance

Owner: lead, app layout/page/styles/not-found and tests/e2e, Playwright config, docs.

- [ ] Write browser tests for semantic landing, API liveness/readiness, 320px width, keyboard skip-link and axe.
- [ ] Implement a truthful landing/status interface with working links; no fake student data or unfinished feature controls.
- [ ] Run browser tests against built application; inspect screenshots.
- [ ] Review integrated foundation, run full deterministic foundation suite and commit only green state.

## Task A1 and later

Only after F1/F2 accepted, freeze authentication schema/service/UI contracts and write a dedicated task packet with exact failing tests. Follow Sections 3.1/5/8 in specification. Subsequent modules remain required and are enumerated in build-status.md. Never compress all pending modules into generic CRUD or skip their test gates to fit this tranche.

