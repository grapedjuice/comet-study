# API contract

Versioned REST uses `/api/v1`. This checkpoint implements only health endpoints; all student-facing endpoints in specification Section 5 remain required and unimplemented.

Success envelope: `{ "data": ... }`, with optional pagination `meta` on growing lists. Failure envelope: `{ "error": { "code": "STABLE_CODE", "message": "safe message", "fieldErrors": {}, "requestId": "..." } }`.

## Health

`GET /api/v1/health/live` returns HTTP 200 and `{ "data": { "status": "ok" } }` if the process responds. It does not prove the database, authentication, or campus providers work.

`GET /api/v1/health/ready` checks a real database query and the applied migration hashes/timestamps against the checked-in migration journal. A healthy foundation returns 200. An unavailable database, invalid environment, missing migration, or changed migration returns 503 with a safe `SERVICE_UNAVAILABLE` error and request ID. Responses are not cached. Integration tests exercise disconnected and outdated databases.

The readiness result covers foundation dependencies only. Authentication, Nebula and other integrations are unimplemented; the endpoint must not be used as evidence of complete-product readiness.

## Authentication slice

`POST /api/v1/auth/request-verification` accepts `{ "email": "student@utdallas.edu" }`. It rejects malformed or non-exact `@utdallas.edu` addresses with 422 and returns a safe 503 when the configured email provider or database is unavailable. A 200 response returns `{ "data": { "delivery": "email", "expiresInSeconds": 600 } }`; the raw token is never returned. The repository stores only token hashes and consumes each token once transactionally.

`POST /api/v1/auth/verify-email` accepts `{ "token": "..." }`, atomically consumes a valid unexpired token, marks the user verified, creates a hashed session record, and returns the user ID while setting an HTTP-only `comet_session` cookie. The cookie is `Secure` in production, `SameSite=Lax`, path-scoped to `/`, and expires with the seven-day session. Invalid, expired, or reused tokens return a safe 422; unavailable dependencies return 503. Email adapters, sign-out, profile, onboarding and account lifecycle remain pending.

## Pending endpoint families

Auth/profile, catalog/enrollments, dashboard/groups/membership, matching, scheduling/votes/RSVP/calendars, rooms, resources, exams, notifications/push, blocking/moderation and operations/jobs. See the preserved specification for exact paths, body schemas, privacy rules and negative-case acceptance checks.

OpenAPI generation and automated route coverage must track the implemented set and must not silently mark pending endpoints complete.
