import { createHash, createHmac, randomBytes, randomInt } from "node:crypto";

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

export const CODE_LENGTH = 6;
/** Uppercase letters and digits minus look-alikes (0/O, 1/I/L). */
export const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** Six random characters from CODE_ALPHABET for the student to type in. */
export function issueCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++)
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

/** What the student typed, as issued: no spaces or dashes, uppercase. */
export function normalizeCode(input: string): string {
  return input.replace(/[\s-]+/g, "").toUpperCase();
}

/** Codes repeat across rows, so each digest is salted with its row id. */
export function codeDigest(rowId: string, code: string): string {
  return hashToken(`${rowId}:${code}`);
}
