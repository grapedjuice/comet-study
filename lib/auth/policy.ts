import { createHash, createHmac, randomBytes } from "node:crypto";

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

/** Keyed hash of the caller's IP so raw addresses are never stored. */
export function requesterHash(request: Request, secret: string): string | null {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    request.headers.get("x-real-ip")?.trim();
  if (!ip) return null;
  return createHmac("sha256", secret).update(ip, "utf8").digest("hex");
}

export function issueToken(): { raw: string; digest: string } {
  const raw = randomBytes(32).toString("base64url");
  return { raw, digest: hashToken(raw) };
}
