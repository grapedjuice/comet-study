import { timingSafeEqual } from "node:crypto";
import { apiError, ok } from "../../../../../lib/api";
import { syncCatalog } from "../../../../../lib/courses";
import { getDatabase } from "../../../../../lib/db";
import { parseEnv } from "../../../../../lib/env";
import { nebulaFor } from "../../../../../lib/request-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: Request, secret: string | undefined) {
  if (!secret || secret.length < 16) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Weekly catalog refresh, called by the scheduler with CRON_SECRET. */
export async function GET(request: Request) {
  let env;
  try {
    env = parseEnv({ ...process.env });
  } catch {
    return apiError("SERVICE_UNAVAILABLE", "Service unavailable", 503);
  }
  if (!authorized(request, env.CRON_SECRET))
    return apiError("UNAUTHENTICATED", "Not authorized", 401);
  const nebula = nebulaFor(env);
  if (!nebula)
    return apiError("CATALOG_UNAVAILABLE", "Live data is disabled", 503);
  try {
    const count = await syncCatalog(getDatabase(env.DATABASE_URL), nebula);
    return ok({ synced: count });
  } catch {
    return apiError("CATALOG_UNAVAILABLE", "Catalog sync failed", 503);
  }
}
