import { randomUUID } from "node:crypto";
import type { createDatabaseClient } from "../db";
import {
  codeDigest,
  isEligibleUtdEmail,
  issueCode,
  issueToken,
  normalizeEmail,
} from "./policy";

type Database = ReturnType<typeof createDatabaseClient>;

export const MAX_LIVE_TOKENS = 3;
/** Wrong guesses one code survives before it stops working. */
export const MAX_CODE_ATTEMPTS = 5;
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
  const code = issueCode();
  const rowId = randomUUID();
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1000);
  const client = await db.pool.connect();
  try {
    await client.query("begin");
    // Serialize requests per address, then cap live codes to limit inbox spam.
    // Codes burned by wrong guesses still count until they expire, which also
    // caps how many guesses one address can take.
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
        rowId,
        userId,
        email,
        codeDigest(rowId, code),
        expiresAt,
        requesterHash,
        now,
      ],
    );
    await client.query("commit");
    return { code, email, expiresAt };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function redeemVerificationCode(
  db: Database,
  emailInput: string,
  code: string,
  now = new Date(),
) {
  const email = normalizeEmail(emailInput);
  const client = await db.pool.connect();
  try {
    await client.query("begin");
    // Same lock as issuing, so concurrent guesses are counted one at a time.
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [email]);
    const live = await client.query<{
      id: string;
      user_id: string;
      token_hash: string;
    }>(
      "select id, user_id, token_hash from verification_tokens where identifier = $1 and used_at is null and expires_at > $2 and attempts < $3 for update",
      [email, now, MAX_CODE_ATTEMPTS],
    );
    const row = live.rows.find(
      (candidate) => candidate.token_hash === codeDigest(candidate.id, code),
    );
    if (!row) {
      // A wrong guess counts against every live code for the address.
      await client.query(
        "update verification_tokens set attempts = attempts + 1 where identifier = $1 and used_at is null and expires_at > $2",
        [email, now],
      );
      await client.query("commit");
      return null;
    }
    // Signing in spends this code and any others still waiting in the inbox.
    await client.query(
      "update verification_tokens set used_at = $1 where identifier = $2 and used_at is null",
      [now, email],
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
