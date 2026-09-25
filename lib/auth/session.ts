import type { createDatabaseClient } from "../db";
import { hashToken } from "./policy";

type Database = ReturnType<typeof createDatabaseClient>;

export const SESSION_COOKIE = "comet_session";

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  emailVerifiedAt: Date | null;
  onboardingCompletedAt: Date | null;
  sessionExpiresAt: Date;
};

export async function findSessionUser(
  db: Database,
  rawToken: string,
  now = new Date(),
): Promise<SessionUser | null> {
  const result = await db.pool.query<{
    id: string;
    email_normalized: string;
    name: string | null;
    email_verified_at: Date | null;
    onboarding_completed_at: Date | null;
    expires_at: Date;
  }>(
    `select u.id, u.email_normalized, u.name, u.email_verified_at, u.onboarding_completed_at, s.expires_at
       from sessions_auth s
       join users u on u.id = s.user_id
      where s.token_hash = $1
        and s.revoked_at is null
        and s.expires_at > $2
        and u.account_status = 'active'`,
    [hashToken(rawToken), now],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    email: row.email_normalized,
    name: row.name,
    emailVerifiedAt: row.email_verified_at,
    onboardingCompletedAt: row.onboarding_completed_at,
    sessionExpiresAt: row.expires_at,
  };
}

export async function revokeSession(
  db: Database,
  rawToken: string,
  now = new Date(),
) {
  const result = await db.pool.query(
    "update sessions_auth set revoked_at = $1 where token_hash = $2 and revoked_at is null",
    [now, hashToken(rawToken)],
  );
  return (result.rowCount ?? 0) > 0;
}
