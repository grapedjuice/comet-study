import { randomUUID } from "node:crypto";
import type { createDatabaseClient } from "../db";
import {
  hashToken,
  isEligibleUtdEmail,
  issueToken,
  normalizeEmail,
} from "./policy";

type Database = ReturnType<typeof createDatabaseClient>;

export async function createVerificationToken(
  db: Database,
  emailInput: string,
  now = new Date(),
) {
  const email = normalizeEmail(emailInput);
  if (!isEligibleUtdEmail(email)) throw new Error("ELIGIBLE_EMAIL_REQUIRED");
  const token = issueToken();
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1000);
  const client = await db.pool.connect();
  try {
    await client.query("begin");
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
      "insert into verification_tokens (id, user_id, identifier, token_hash, expires_at) values ($1, $2, $3, $4, $5)",
      [randomUUID(), userId, email, token.digest, expiresAt],
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
    await client.query("commit");
    return {
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
