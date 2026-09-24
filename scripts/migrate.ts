import { createDatabaseClient, runMigrations } from "../lib/db";
import { parseEnv } from "../lib/env";

async function main() {
  const env = parseEnv(process.env);
  const db = createDatabaseClient(env.DATABASE_URL);
  try {
    await runMigrations(db);
    console.log("Migrations applied");
  } finally {
    await db.close();
  }
}

main().catch(() => {
  console.error("Migration failed");
  process.exitCode = 1;
});
