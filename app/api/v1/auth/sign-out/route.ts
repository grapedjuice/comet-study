import { cookies } from "next/headers";
import { apiError, isSameOrigin, ok } from "../../../../../lib/api";
import { revokeSession, SESSION_COOKIE } from "../../../../../lib/auth/session";
import { getDatabase } from "../../../../../lib/db";
import { parseEnv } from "../../../../../lib/env";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isSameOrigin(request))
    return apiError("FORBIDDEN_ORIGIN", "Cross-site request rejected", 403);
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    try {
      const env = parseEnv({ ...process.env });
      await revokeSession(getDatabase(env.DATABASE_URL), token);
    } catch {
      // Clearing the cookie still signs this browser out.
    }
  }
  jar.delete(SESSION_COOKIE);
  return ok({ signedOut: true });
}
