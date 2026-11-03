import { z } from "zod";
import { apiError, isSameOrigin, ok, readJson } from "../../../../../lib/api";
import { normalizeCode } from "../../../../../lib/auth/policy";
import { redeemVerificationCode } from "../../../../../lib/auth/repository";
import { SESSION_COOKIE } from "../../../../../lib/auth/session";
import { getDatabase } from "../../../../../lib/db";
import { parseEnv } from "../../../../../lib/env";

export const runtime = "nodejs";

const bodySchema = z
  .object({
    email: z.string().trim().email(),
    // People type codes in lowercase or paste them with spaces.
    code: z
      .string()
      .transform(normalizeCode)
      .pipe(z.string().regex(/^[A-Z0-9]{6}$/)),
  })
  .strict();

export async function POST(request: Request) {
  if (!isSameOrigin(request))
    return apiError("FORBIDDEN_ORIGIN", "Cross-site request rejected", 403);
  const body = await readJson(request);
  if (body === undefined)
    return apiError("INVALID_JSON", "Request body must be valid JSON", 422);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success)
    return apiError("INVALID_REQUEST", "Enter the 6-character code", 422);

  try {
    const env = parseEnv({ ...process.env });
    const result = await redeemVerificationCode(
      getDatabase(env.DATABASE_URL),
      parsed.data.email,
      parsed.data.code,
    );
    if (!result)
      return apiError(
        "INVALID_CODE",
        "That code is wrong or expired. Check it, or request a new one.",
        422,
      );
    const response = ok({
      userId: result.userId,
      onboardingRequired: result.onboardingRequired,
    });
    response.cookies.set({
      name: SESSION_COOKIE,
      value: result.sessionToken,
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: result.expiresAt,
    });
    return response;
  } catch {
    return apiError(
      "SERVICE_UNAVAILABLE",
      "Verification is temporarily unavailable",
      503,
    );
  }
}
