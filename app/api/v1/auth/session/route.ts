import { cookies } from "next/headers";
import { apiError, ok } from "../../../../../lib/api";
import {
  findSessionUser,
  SESSION_COOKIE,
} from "../../../../../lib/auth/session";
import { getDatabase } from "../../../../../lib/db";
import { parseEnv } from "../../../../../lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return ok({ user: null });
  try {
    const env = parseEnv({ ...process.env });
    const user = await findSessionUser(getDatabase(env.DATABASE_URL), token);
    if (!user) return ok({ user: null });
    return ok({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
        onboardingCompleted: Boolean(user.onboardingCompletedAt),
      },
      expiresAt: user.sessionExpiresAt.toISOString(),
    });
  } catch {
    return apiError(
      "SERVICE_UNAVAILABLE",
      "Session lookup is temporarily unavailable",
      503,
    );
  }
}
