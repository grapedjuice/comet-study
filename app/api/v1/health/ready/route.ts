import { NextResponse } from "next/server";
import { createDatabaseClient, isDatabaseReady } from "../../../../../lib/db";
import { parseEnv } from "../../../../../lib/env";
import { readiness } from "../../../../../lib/health";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const result = await readiness(async () => {
    const env = parseEnv(process.env);
    const db = createDatabaseClient(env.DATABASE_URL);
    try {
      return await isDatabaseReady(db);
    } finally {
      await db.close();
    }
  });
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { "Cache-Control": "no-store" },
  });
}
