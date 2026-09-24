import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createDatabaseClient,
  isDatabaseReady,
  runMigrations,
} from "../../lib/db";
import { seedDemo } from "../../db/seed";

const url = process.env.DATABASE_URL;
if (!url || process.env.COMET_ISOLATED_TEST_DB !== "1") {
  throw new Error(
    "Integration tests require the isolated test database wrapper",
  );
}

const db = createDatabaseClient(url);

beforeAll(async () => {
  if (!(await isDatabaseReady(db))) await runMigrations(db);
  expect(await isDatabaseReady(db)).toBe(true);
});

afterAll(async () => {
  await db.close();
});

describe("migration and readiness on PostgreSQL", () => {
  it("can repeat a migration safely", async () => {
    await runMigrations(db);
    const count = await db.pool.query(
      "select count(*)::int as n from drizzle.__drizzle_migrations",
    );
    expect(count.rows[0].n).toBe(2);
    const tables = await db.pool.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public' and table_name in ('users', 'verification_tokens', 'sessions_auth') order by table_name",
    );
    expect(tables.rows.map((row) => row.table_name)).toEqual([
      "sessions_auth",
      "users",
      "verification_tokens",
    ]);
  });

  it("marks a stale migration journal unready", async () => {
    const original = await db.pool.query<{ hash: string }>(
      "select hash from drizzle.__drizzle_migrations",
    );
    try {
      await db.pool.query(
        "update drizzle.__drizzle_migrations set hash = 'stale'",
      );
      expect(await isDatabaseReady(db)).toBe(false);
    } finally {
      await db.pool.query("update drizzle.__drizzle_migrations set hash = $1", [
        original.rows[0].hash,
      ]);
    }
  });

  it("marks a disconnected database unready", async () => {
    const disconnected = createDatabaseClient(
      "postgresql://postgres:unused@127.0.0.1:1/unavailable",
    );
    expect(await isDatabaseReady(disconnected)).toBe(false);
    await disconnected.close();
  });
});

describe("fictional demo seed", () => {
  it("is idempotent in test", async () => {
    await seedDemo(db, "test");
    await seedDemo(db, "test");
    const count = await db.pool.query(
      "select count(*)::int as n from demo_seed_markers",
    );
    expect(count.rows[0].n).toBe(1);
  });

  it("rejects production even with an available database", async () => {
    await expect(seedDemo(db, "production")).rejects.toThrow(/production/i);
  });
});
