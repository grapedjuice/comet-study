# Foundation review — RV1

Date: 2026-09-22. Scope: tranche 1 F1/F2 foundation checkpoint only. Disposition: **no unresolved actionable finding in the reviewed core snapshot**; integrated acceptance remains the lead's responsibility.

Reviewer model selected by host dispatch: **gpt-6-astra**, high reasoning, fresh context. Lead confirmed the exact selection; the runtime model ID and actual usage were not independently observable. Assignment: one bounded 6-planning-point block. No nested agents, commits, application edits, live provider requests, build, browser tests, or changes to the running port-3000 preview.

## Findings resolved during review

| ID | Severity | Location at discovery | Invariant and reproducer | Disposition |
|---|---|---|---|---|
| RV1-1 | P1 | package.json start script; lib/env.ts:9 | Production startup must apply production validation even when NODE_ENV is absent. The original start command ran env:check before Next; parseEnv defaulted to development. A synthetic HTTP origin, repeated-character secret, fixture data and console email therefore passed that preliminary check. | Resolved by scripts/start.ts, which validates and launches with NODE_ENV=production. Executed the script with those synthetic values and NODE_ENV deleted: exit 1, names-only diagnostic, empty stdout. No server was launched. |
| RV1-2 | P2 | lib/env.ts:40 | An active provider's required credential must contain non-whitespace content. Executed parseEnv with production/live mode and NEBULA_API_KEY containing three spaces; the original code accepted it. The same truthiness checks covered email credentials and sender. | Resolved concurrently: trimmed presence checks for provider credentials, sender validation, and whitespace auth-secret rejection. Reviewed the changes and reran unit tests: 15/15 passed. |

No speculative module-2-or-later omissions are classified as foundation defects.

## Evidence actually executed

- Initial `npm run test:unit`: 2 files, 13 tests passed.
- Post-fix `npm run test:unit`: 2 files, 15 tests passed (20:35:22 local tool output).
- Synthetic parseEnv probes established the original startup-default and whitespace-key issues without using real credentials.
- Constructed and closed a PostgreSQL pool against an unused loopback address without making a query: initial pool connection count was 0.
- Ran the new start script's invalid-production path in a child process with a 5-second timeout: exited 1 and printed only variable names.

No real PostgreSQL integration run, migration execution, e2e, accessibility, build, full verification, security scan, or live upstream test was performed by this reviewer. Existing test source is not counted as executed evidence.

## Static review conclusions and limits

Read AGENTS.md, architecture/security documents, F1/F2 plan and build status. Reviewed environment parsing, lazy database factory, migration SQL/journal, seed guard, health services/routes, shell/layout/styles/not-found, unit/integration/e2e tests, test PostgreSQL wrapper, migration/seed/env-check/start scripts, package scripts and test configuration.

- Production fixture and console adapters, HTTP origin, missing core values and obvious placeholder auth secrets are rejected. Validation errors report names, not values. Auth-secret checks cannot prove randomness; generation remains an operator obligation.
- Database setup has no import-time connection. The readiness route creates its client on request and closes it in a finally block. Liveness is independent of database and environment parsing.
- Readiness catches database/ledger failures, compares migration count, hashes and timestamps, and returns a redacted 503 with request ID. Both health routes explicitly return no-store.
- **Migration drift means migration-ledger/file drift here.** Readiness does not introspect actual tables/columns after a matching ledger. A manually dropped table with an unchanged ledger is not detected. This is a documented review limitation, not a newly imposed checkpoint acceptance requirement.
- Seed entry requires DEMO_SEED=1; the seed function rejects production before issuing SQL.
- The PostgreSQL wrapper replaces DATABASE_URL with an isolated database. Its optional administrator path generates the database name internally and drops only that generated database. Embedded cleanup is scoped to a generated directory below repository .tmp. No test reset of a caller-supplied DATABASE_URL was found. Actual creation/cleanup execution remains unverified by this review.
- The shell states that access is closed, describes planned capabilities as plans, and exposes working document navigation rather than fake student records or unfinished actions. Browser usability claims require the lead's browser evidence.
- E2E health coverage exercises success only. Unit/integration source covers dependency exceptions, disconnection and ledger mismatch; it does not substitute for an HTTP 503 test or prove browser failure-state coverage.

## Reviewed snapshot and concurrent changes

The tree was uncommitted during review; no commit SHA can identify it. Initial hashes were captured after initial unit execution; closing hashes below were captured before the post-fix unit rerun. Important reviewed files:

| File | SHA-256 |
|---|---|
| lib/db.ts | `20bccf12b3e9f409e8d2723ed7a2eeaadf4d44fef2e071cb970665c5218b8442` |
| lib/env.ts | `99ac93ddc9dcd58ccbc3200d7eef1ec6879763baf2624d4b8e2b8b889b4ea2c6` |
| lib/health-schema.ts | `4eee6c07b94c12ac5a170572906536fe44d48b69095427fe44cc34f9a465c2b3` |
| lib/health.ts | `837e5b18a8af7873008750bdab6e711008dbb436ed70e6e518e744fbf22461a1` |
| db/schema.ts | `4fa094bd3fb72c91bdf1a34c95ed6a4e6c47a46f381eccd0c572af6f61e5a003` |
| db/seed.ts | `2e129060d4f6007f57cbfdb88694f32ef501819a36b8289f1b07899997e0635a` |
| db/migrations/0000_lame_stick.sql | `d5f703493b561b697701e7d4e06d9686ebe9c70508e7411e9a257a6e2fddb433` |
| tests/e2e/foundation.spec.ts | `b14d5293082d62ace810bcbe1a951948ec537afcc814ebdf9eeb892372ade388` |
| tests/integration/database.test.ts | `82168e7daec28869a9ee6cf3085b877b7fb95a6f16614a6adfd911d5eae5782a` |
| tests/unit/env.test.ts | `9534d0ca8b61c2e84e9c44480c12ee7a3f1150bf48f66c59a0f9eadee0deb1e0` |
| scripts/start.ts | `d4fe6fd547cb390f598ad5b4090c6884aa0b514b8a6ec87ae664455fd6c6649a` |
| scripts/test-with-postgres.ts | `16125c10e2580721042059b4a73a479b9503895e555e1961d61f4e95702c4344` |
| package.json | `e07acdc0f1bb6d072f57453d4cc6b0c4a5bcbd75d36c19762686db321f4bcb07` |

During review, lib/env.ts, lib/health.ts, tests/unit/env.test.ts and package.json changed; lib/health-schema.ts and scripts/start.ts were added. These were reread. scripts/generate-openapi.ts was read statically. app/layout.tsx and app/not-found.tsx changed during the lead's internal-link fix; those final revisions were not reread in this bounded review.

The worker was still finishing CI/security/generated-artifact checks. No .github/workflows or tests/security implementation was available in the review read; these and any later edits require the lead's checks. The package version transition and lockfile/install consistency were not certified. The post-fix unit pass applies to core environment/health code at execution time, not to all subsequently changing files.

This report is independent foundation review evidence, not a final full-product audit or release approval.

