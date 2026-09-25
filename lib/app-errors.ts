/** A failure whose message is safe and useful to show the student. */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserFacingError";
  }
}

/** "Taylor Reed" → "Taylor R."; falls back to the email's local part. */
export function publicName(name: string | null, email?: string) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return email ? email.split("@")[0] : "Classmate";
  return parts.length > 1 ? `${parts[0]} ${parts.at(-1)![0]}.` : parts[0];
}

export function initials(name: string | null) {
  const parts = (name ?? "?").trim().split(/\s+/).filter(Boolean);
  return (
    (parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts.at(-1)![0] : "")
  ).toUpperCase();
}

export const isUuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
