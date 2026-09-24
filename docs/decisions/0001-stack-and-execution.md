# ADR 0001: stack and bounded execution

Status: accepted for implementation, 2026-09-22.

Use the specified Next.js/TypeScript/PostgreSQL/Drizzle/Zod stack. Use npm with a lockfile because Node 24.13.1/npm 11.8.0 are installed. No mixed ORM. Use native PostgreSQL for real integration tests; investigate a project-local disposable native binary because Docker and psql are absent from PATH. PGlite would be useful for fast tests but is not a replacement for mandated real PostgreSQL verification.

Use disjoint file ownership and up to three workers. Exact selectable worker IDs: gpt-6-sol, gpt-6-luna, gpt-6-astra, gpt-5.6-sol, gpt-5.6-terra. Model prices and usage multipliers unknown. Lead exact model ID unknown; conservatively account at Astra weight (6/block). User's autonomous execution instruction governs routine design choices and overrides skill approval handoffs.

A 100-point tranche is mandatory absent a different budget. Stop new features at 75; reserve 25 for integration/checkpoint. Do not open a new tranche without continuation. Missing front-end inspiration artifact does not block a new original design. No credentials requested until the corresponding adapter is ready.
