# Database state

The first migration contains a deliberately small `demo_seed_markers` table to exercise migrations and the guarded, idempotent development seed. The second migration adds the minimal identity, hashed verification-token, and hashed session tables needed by the auth persistence slice. It contains no schedules or campus claims. Drizzle maintains the migration journal separately.

This is a foundation schema, not the product schema. Identity, academic, room, group, scheduling, resource, exam, notification and moderation tables from specification Section 4 are still required. Add their migrations within their vertical modules after interface review.

```mermaid
erDiagram
  demo_seed_markers {
    text id PK
    text label
  }
  users ||--o{ verification_tokens : issues
  users ||--o{ sessions_auth : owns
  users {
    uuid id PK
    text email_normalized UK
    timestamptz email_verified_at
    text account_status
  }
  verification_tokens {
    uuid id PK
    uuid user_id FK
    text token_hash UK
    timestamptz expires_at
    timestamptz used_at
  }
  sessions_auth {
    uuid id PK
    uuid user_id FK
    text token_hash UK
    timestamptz expires_at
    timestamptz revoked_at
  }
```

Applied SQL migration hashes and timestamps must match the checked-in journal for database readiness. Never edit an applied migration after release; add a corrective migration instead.
