/** Refresh the cached UTD course catalog from Nebula: `npm run catalog:sync`. */
import { catalogStatus, syncCatalog } from "../lib/courses";
import { createDatabaseClient } from "../lib/db";
import { parseEnv } from "../lib/env";
import { createNebulaClient } from "../lib/nebula";

async function main() {
  const env = parseEnv({ ...process.env });
  if (!env.NEBULA_API_KEY) throw new Error("NEBULA_API_KEY is not set");
  const db = createDatabaseClient(env.DATABASE_URL);
  try {
    const started = Date.now();
    const count = await syncCatalog(db, createNebulaClient(env.NEBULA_API_KEY));
    const status = await catalogStatus(db);
    console.log(
      `Synced ${count} courses in ${Date.now() - started}ms (catalog now ${status.count}).`,
    );
  } finally {
    await db.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
