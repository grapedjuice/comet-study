import { resolve } from "node:path";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

export function createDatabaseClient(url: string) {
  const pool = new Pool({
    connectionString: url,
    // Serverless Postgres can take a few seconds to wake from idle.
    connectionTimeoutMillis: 5000,
    max: 5,
  });
  return { pool, close: () => pool.end() };
}

type Database = ReturnType<typeof createDatabaseClient>;
const shared = globalThis as typeof globalThis & {
  __cometDb?: { url: string; db: Database };
};

/** One pool per process for route handlers; survives dev hot reloads. */
export function getDatabase(url: string): Database {
  if (shared.__cometDb?.url !== url) {
    void shared.__cometDb?.db.close().catch(() => undefined);
    const db = createDatabaseClient(url);
    db.pool.on("error", () => undefined);
    shared.__cometDb = { url, db };
  }
  return shared.__cometDb.db;
}

const migrationsFolder = resolve(process.cwd(), "db/migrations");

export async function isDatabaseReady(
  db: ReturnType<typeof createDatabaseClient>,
) {
  try {
    await db.pool.query("select 1");
    const expected = readMigrationFiles({ migrationsFolder });
    if (expected.length === 0) return false;
    const applied = await db.pool.query<{ hash: string; created_at: string }>(
      "select hash, created_at from drizzle.__drizzle_migrations order by created_at asc",
    );
    return (
      applied.rows.length === expected.length &&
      applied.rows.every(
        (row, index) =>
          row.hash === expected[index].hash &&
          Number(row.created_at) === expected[index].folderMillis,
      )
    );
  } catch {
    return false;
  }
}

export async function runMigrations(
  db: ReturnType<typeof createDatabaseClient>,
) {
  await migrate(drizzle(db.pool), { migrationsFolder });
}
