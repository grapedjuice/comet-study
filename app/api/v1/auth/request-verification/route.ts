import { z } from "zod";
import { apiError, isSameOrigin, ok, readJson } from "../../../../../lib/api";
import { getDatabase } from "../../../../../lib/db";
import { parseEnv } from "../../../../../lib/env";
import { createDelivery } from "../../../../../lib/auth/delivery";
import { requestVerification } from "../../../../../lib/auth/service";
import {
  isEligibleUtdEmail,
  requesterHash,
} from "../../../../../lib/auth/policy";

export const runtime = "nodejs";

const bodySchema = z.object({ email: z.string().trim().email() }).strict();

export async function POST(request: Request) {
  if (!isSameOrigin(request))
    return apiError("FORBIDDEN_ORIGIN", "Cross-site request rejected", 403);
  const body = await readJson(request);
  if (body === undefined)
    return apiError("INVALID_JSON", "Request body must be valid JSON", 422);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success)
    return apiError("INVALID_REQUEST", "Enter a valid email address", 422, {
      email: "Enter a valid email address",
    });
  if (!isEligibleUtdEmail(parsed.data.email))
    return apiError(
      "ELIGIBLE_EMAIL_REQUIRED",
      "Use an eligible university email address",
      422,
    );

  let env;
  try {
    env = parseEnv({ ...process.env });
  } catch {
    return apiError(
      "SERVICE_UNAVAILABLE",
      "Sign-in is temporarily unavailable",
      503,
    );
  }
  // Hand the link back so the sign-in page can open it directly: always in
  // local console mode (parseEnv rejects that in production), and anywhere
  // INSTANT_SIGNIN=on, which skips sending the email altogether.
  const instant = env.INSTANT_SIGNIN === "on";
  const consoleMode =
    env.EMAIL_PROVIDER === "console" && env.NODE_ENV !== "production";
  if (env.EMAIL_PROVIDER === "disabled" && !instant)
    return apiError(
      "EMAIL_UNAVAILABLE",
      "Student sign-in is not available in this preview",
      503,
    );

  let devLink: string | undefined;
  const deliver = createDelivery(env);
  try {
    const result = await requestVerification(
      getDatabase(env.DATABASE_URL),
      parsed.data.email,
      async (input) => {
        if (!instant) await deliver(input);
        if (instant || consoleMode)
          devLink = `/verify#token=${encodeURIComponent(input.token)}`;
      },
      new Date(),
      requesterHash(request, env.AUTH_SECRET),
    );
    return ok({
      delivery: instant ? "instant" : consoleMode ? "console" : "email",
      expiresInSeconds: result.expiresInSeconds,
      ...(devLink ? { devLink } : {}),
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "RATE_LIMITED")
      return apiError(
        "RATE_LIMITED",
        instant
          ? "Too many sign-in links were requested. Try again later."
          : "Too many sign-in links were requested. Check your inbox or try again later.",
        429,
      );
    if (code === "EMAIL_UNAVAILABLE")
      return apiError(
        "EMAIL_UNAVAILABLE",
        "Verification email is temporarily unavailable",
        503,
      );
    return apiError(
      "SERVICE_UNAVAILABLE",
      "Sign-in is temporarily unavailable",
      503,
    );
  }
}
