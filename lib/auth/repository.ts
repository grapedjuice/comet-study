import { randomUUID } from "node:crypto";
import type { createDatabaseClient } from "../db";
import {
  hashToken,
  isEligibleUtdEmail,
  issueToken,
  normalizeEmail,
} from "./policy";

type Database = ReturnType<typeof createDatabaseClient>;

export const MAX_LIVE_TOKENS = 3;
/** Sign-in emails one network may trigger per hour, across all addresses. */
export const MAX_REQUESTS_PER_REQUESTER_HOUR = 10;

export async function createVerificationToken(
  db: Database,
  emailInput: string,
  now = new Date(),
  requesterHash: string | null = null,
) {
  const email = normalizeEmail(emailInput);
  if (!isEligibleUtdEmail(email)) throw new Error("ELIGIBLE_EMAIL_REQUIRED");
  const token = issueToken();
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1000);
  const client = await db.pool.connect();
  try {
    await client.query("begin");
    // Serialize requests per address, then cap live links to limit inbox spam.
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [email]);
    const live = await client.query<{ count: string }>(
      "select count(*) from verification_tokens where identifier = $1 and used_at is null and expires_at > $2",
      [email, now],
    );
    if (Number(live.rows[0].count) >= MAX_LIVE_TOKENS)
      throw new Error("RATE_LIMITED");
    if (requesterHash) {
      const recent = await client.query<{ count: string }>(
        "select count(*) from verification_tokens where requester_hash = $1 and created_at > $2",
        [requesterHash, new Date(now.getTime() - 60 * 60 * 1000)],
      );
      if (Number(recent.rows[0].count) >= MAX_REQUESTS_PER_REQUESTER_HOUR)
        throw new Error("RATE_LIMITED");
    }
    const existing = await client.query<{ id: string }>(
      "select id from users where email_normalized = $1",
      [email],
    );
    const userId =
      existing.rows[0]?.id ??
      (
        await client.query<{ id: string }>(
          "insert into users (id, email_normalized) values ($1, $2) returning id",
          [randomUUID(), email],
        )
      ).rows[0].id;
    await client.query(
      "insert into verification_tokens (id, user_id, identifier, token_hash, expires_at, requester_hash, created_at) values ($1, $2, $3, $4, $5, $6, $7)",
      [
        randomUUID(),
        userId,
        email,
        token.digest,
        expiresAt,
        requesterHash,
        now,
      ],
    );
    await client.query("commit");
    return { rawToken: token.raw, tokenHash: token.digest, email, expiresAt };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function redeemVerificationToken(
  db: Database,
  rawToken: string,
  now = new Date(),
) {
  const tokenHash = hashToken(rawToken);
  const client = await db.pool.connect();
  try {
    await client.query("begin");
    const found = await client.query<{ id: string; user_id: string }>(
      "select id, user_id from verification_tokens where token_hash = $1 and used_at is null and expires_at > $2 for update",
      [tokenHash, now],
    );
    const row = found.rows[0];
    if (!row) {
      await client.query("rollback");
      return null;
    }
    await client.query(
      "update verification_tokens set used_at = $1 where id = $2 and used_at is null",
      [now, row.id],
    );
    await client.query(
      "update users set email_verified_at = coalesce(email_verified_at, $1), last_active_at = $1, updated_at = $1 where id = $2",
      [now, row.user_id],
    );
    const session = issueToken();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    await client.query(
      "insert into sessions_auth (id, user_id, token_hash, expires_at, last_rotated_at) values ($1, $2, $3, $4, $5)",
      [randomUUID(), row.user_id, session.digest, expiresAt, now],
    );
    const profile = await client.query<{
      onboarding_completed_at: Date | null;
    }>("select onboarding_completed_at from users where id = $1", [
      row.user_id,
    ]);
    await client.query("commit");
    return {
      onboardingRequired: !profile.rows[0]?.onboarding_completed_at,
      userId: row.user_id,
      sessionToken: session.raw,
      sessionTokenHash: session.digest,
      expiresAt,
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
