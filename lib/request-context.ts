import { cookies } from "next/headers";
import { findSessionUser, SESSION_COOKIE } from "./auth/session";
import { getDatabase } from "./db";
import { parseEnv, type AppEnv } from "./env";
import { createNebulaClient, type NebulaClient } from "./nebula";

const shared = globalThis as typeof globalThis & {
  __cometNebula?: { key: string; client: NebulaClient };
};

/** Live Nebula client when DATA_MODE=live; null otherwise. */
export function nebulaFor(env: AppEnv): NebulaClient | null {
  if (env.DATA_MODE !== "live" || !env.NEBULA_API_KEY) return null;
  if (shared.__cometNebula?.key !== env.NEBULA_API_KEY)
    shared.__cometNebula = {
      key: env.NEBULA_API_KEY,
      client: createNebulaClient(env.NEBULA_API_KEY),
    };
  return shared.__cometNebula.client;
}

/** Signed-in user plus request dependencies; throws on misconfiguration. */
export async function currentUserContext() {
  const env = parseEnv({ ...process.env });
  const db = getDatabase(env.DATABASE_URL);
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const user = token ? await findSessionUser(db, token) : null;
  return { env, db, user, nebula: nebulaFor(env) };
}
