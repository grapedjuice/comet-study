# Operations

Release status: not production ready. No hosted deployment or remote repository has been configured. Local setup is documented in README as implementation is verified.

## Required production controls

A release operator must configure independent production secrets, a managed PostgreSQL database, verified email sender and rotated Nebula key. Never point test runners at production. No automated demo seeding on startup.

Deploy migrations as a reviewed release step. Back up before schema changes; prefer forward corrective migrations. Reverting application code is allowed only when schema compatibility is established. Destructive migration rollback requires snapshot restore in an isolated recovery environment, row-count/invariant verification and an explicit cutover decision.

Health live indicates the application process is responsive; health ready must fail on unavailable database or missing migration. Restrict detailed internal diagnostics; public health responses must not include credentials or connection strings.

## Unverified operational gates

Managed database backups and restore drill; alert delivery; job dead-letter monitoring; runtime metrics; security header deployment; production email, storage/scanning and push; DNS/TLS; preview and production isolation; deployment rollback. None has been verified yet. Do not deploy this checkpoint as a completed student application.

