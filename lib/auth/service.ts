import type { createDatabaseClient } from "../db";
import { createVerificationToken } from "./repository";
import { isEligibleUtdEmail, normalizeEmail } from "./policy";

type Database = ReturnType<typeof createDatabaseClient>;
export type VerificationDelivery = (input: {
  email: string;
  token: string;
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
    token: created.rawToken,
    expiresAt: created.expiresAt,
  });
  return { email, expiresInSeconds: 600 };
}
