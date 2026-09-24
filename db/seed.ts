import type { createDatabaseClient } from "../lib/db";

export async function seedDemo(
  db: ReturnType<typeof createDatabaseClient>,
  mode: string,
) {
  if (mode === "production")
    throw new Error("Demo seed is prohibited in production");
  if (mode !== "development" && mode !== "test")
    throw new Error("Unknown environment mode");
  await db.pool.query(
    "insert into demo_seed_markers (id, label) values ($1, $2) on conflict (id) do nothing",
    ["fictional-demo", "Fictional demo data only"],
  );
}
