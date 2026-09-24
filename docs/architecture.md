# Architecture

## Intent

Verified UTD students form small course-linked groups, find recurring times and likely free rooms, share resources, and confirm exam dates. PostgreSQL is the source of truth. Only servers access credentials and campus feeds. User-visible uncertainty preserves source and freshness.

## Boundaries

Next.js server components read through services; client components handle forms. Versioned REST handlers validate with Zod and derive the actor from a server session. Services enforce authorization and transactional invariants. Drizzle owns database schema; checked-in SQL migrations run before startup. Provider adapters isolate Nebula, email, uploads and notifications. PostgreSQL outbox processing is the planned durable job backend.

## Module order

1. Tooling, environment, CI, database and health.
2. Authentication, sessions, onboarding and private profiles.
3. Academic data and Nebula synchronization.
4. Enrollments, dashboard and groups.
5. Availability and matching.
6. Scheduling and calendars.
7. Rooms.
8. Resources.
9. Exams.
10. Notifications.
11. Moderation and lifecycle.
12. Deployment, accessibility and performance hardening.

Each module must pass its tests before dependent implementation starts. Full-product acceptance remains distinct from a green foundation.

## Shared API contract

Success: { data, meta? }. Failure: { error: { code, message, fieldErrors: {}, requestId } }. Validation 422; missing session 401; forbidden 403 or non-leaking 404; concurrent conflict 409; rate limit 429. Private responses use Cache-Control: no-store. Health readiness must query the database and validate the migration state; liveness must not depend on external services.

## Foundation contracts

lib/env.ts exports parseEnv(input: Record<string, string | undefined>); no environment values in validation errors. lib/db.ts exports database connection factory and explicit close behavior. lib/health.ts exports liveness and dependency-injected readiness functions. app/api/v1/health/live and ready return the shared envelope; readiness returns 503 on missing dependencies. No connection happens at import/build time.

