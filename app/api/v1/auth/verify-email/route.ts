import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { redeemVerificationToken } from "../../../../../lib/auth/repository";
import { createDatabaseClient } from "../../../../../lib/db";
import { parseEnv } from "../../../../../lib/env";

const bodySchema = z
  .object({ token: z.string().trim().min(1).max(512) })
  .strict();
const SESSION_COOKIE = "comet_session";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(
      "INVALID_JSON",
      "Request body must be valid JSON",
      422,
    );
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      "INVALID_REQUEST",
      "Enter a valid verification token",
      422,
    );
  }

  try {
    const env = parseEnv({ ...process.env });
    const db = createDatabaseClient(env.DATABASE_URL);
    try {
      const result = await redeemVerificationToken(db, parsed.data.token);
      if (!result)
        return errorResponse(
          "INVALID_TOKEN",
          "This verification link is invalid or expired",
          422,
        );

      const response = NextResponse.json(
        { data: { userId: result.userId, onboardingRequired: true } },
        { headers: { "Cache-Control": "no-store" } },
      );
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
    } finally {
      await db.close();
    }
  } catch {
    return errorResponse(
      "SERVICE_UNAVAILABLE",
      "Verification is temporarily unavailable",
      503,
    );
  }
}

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json(
    { error: { code, message, fieldErrors: {}, requestId: randomUUID() } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
