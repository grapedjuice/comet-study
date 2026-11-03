import type { createDatabaseClient } from "../db";
import { createVerificationToken } from "./repository";
import { isEligibleUtdEmail, normalizeEmail } from "./policy";

type Database = ReturnType<typeof createDatabaseClient>;
export type VerificationDelivery = (input: {
  email: string;
  code: string;
  expiresAt: Date;
}) => Promise<void>;

export async function requestVerification(
  db: Database | null,
  emailInput: string,
  deliver: VerificationDelivery,
  now = new Date(),
  requesterHash: string | null = null,
) {
  const email = normalizeEmail(emailInput);
  if (!isEligibleUtdEmail(email)) throw new Error("ELIGIBLE_EMAIL_REQUIRED");
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const created = await createVerificationToken(db, email, now, requesterHash);
  await deliver({
    email,
    code: created.code,
    expiresAt: created.expiresAt,
  });
  return { email, expiresInSeconds: 600 };
}
