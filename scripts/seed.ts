import { seedDemo } from "../db/seed";
import { createDatabaseClient } from "../lib/db";
import { parseEnv } from "../lib/env";

async function main() {
  const env = parseEnv(process.env);
  if (process.env.DEMO_SEED !== "1")
    throw new Error("Set DEMO_SEED=1 to opt in to fictional demo data");
  const db = createDatabaseClient(env.DATABASE_URL);
  try {
    await seedDemo(db, env.NODE_ENV);
    console.log("Fictional demo seed applied");
  } finally {
    await db.close();
  }
}

main().catch((error) => {
  if (
    error instanceof Error &&
    /Demo seed is prohibited|Set DEMO_SEED=1/.test(error.message)
  ) {
    console.error(error.message);
  } else {
    console.error("Seed failed");
  }
  process.exitCode = 1;
});
