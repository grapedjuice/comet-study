import { createHash, randomBytes } from "node:crypto";

const ELIGIBLE_DOMAIN = "utdallas.edu";

export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

export function isEligibleUtdEmail(input: string): boolean {
  const email = normalizeEmail(input);
  const at = email.lastIndexOf("@");
  return (
    at > 0 &&
    at === email.indexOf("@") &&
    email.slice(at + 1) === ELIGIBLE_DOMAIN &&
    email.slice(0, at).length > 0
  );
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

export function issueToken(): { raw: string; digest: string } {
  const raw = randomBytes(32).toString("base64url");
  return { raw, digest: hashToken(raw) };
}
