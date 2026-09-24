import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createDatabaseClient } from "../../../../../lib/db";
import { parseEnv } from "../../../../../lib/env";
import { requestVerification } from "../../../../../lib/auth/service";
import { isEligibleUtdEmail } from "../../../../../lib/auth/policy";

const bodySchema = z.object({ email: z.string().trim().email() }).strict();

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_JSON",
          message: "Request body must be valid JSON",
          fieldErrors: {},
          requestId: randomUUID(),
        },
      },
      { status: 422, headers: { "Cache-Control": "no-store" } },
    );
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_REQUEST",
          message: "Enter a valid email address",
          fieldErrors: { email: "Enter a valid email address" },
          requestId: randomUUID(),
        },
      },
      { status: 422, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!isEligibleUtdEmail(parsed.data.email)) {
    return NextResponse.json(
      {
        error: {
          code: "ELIGIBLE_EMAIL_REQUIRED",
          message: "Use an eligible university email address",
          fieldErrors: {},
          requestId: randomUUID(),
        },
      },
      { status: 422, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    const env = parseEnv({ ...process.env });
    if (env.EMAIL_PROVIDER === "disabled") throw new Error("EMAIL_UNAVAILABLE");
    const db = createDatabaseClient(env.DATABASE_URL);
    try {
      const result = await requestVerification(
        db,
        parsed.data.email,
        async () => {
          if (env.EMAIL_PROVIDER === "console" && env.NODE_ENV !== "production")
            return;
          throw new Error("EMAIL_UNAVAILABLE");
        },
      );
      return NextResponse.json(
        {
          data: {
            delivery: "email",
            expiresInSeconds: result.expiresInSeconds,
          },
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    } finally {
      await db.close();
    }
  } catch (error) {
    const code =
      error instanceof Error &&
      ["DATABASE_UNAVAILABLE", "EMAIL_UNAVAILABLE"].includes(error.message)
        ? error.message
        : "SERVICE_UNAVAILABLE";
    const status = code === "ELIGIBLE_EMAIL_REQUIRED" ? 422 : 503;
    return NextResponse.json(
      {
        error: {
          code,
          message:
            code === "ELIGIBLE_EMAIL_REQUIRED"
              ? "Use an eligible university email address"
              : "Verification email is temporarily unavailable",
          fieldErrors: {},
          requestId: randomUUID(),
        },
      },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
}
