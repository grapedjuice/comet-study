import { randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { join, resolve, sep } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Client } from "pg";
import { createDatabaseClient, runMigrations } from "../lib/db";
import { restrictedPgCtl } from "./pg-ctl";

type IsolatedDatabase = { url: string; close: () => Promise<void> };

function run(args: string[], env: NodeJS.ProcessEnv) {
  const result = spawnSync(process.execPath, args, { stdio: "inherit", env });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`Test command failed with exit code ${result.status}`);
}

async function availablePort() {
  const server = createServer();
  await new Promise<void>((resolveReady) =>
    server.listen(0, "127.0.0.1", resolveReady),
  );
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Could not allocate a local port");
  const port = address.port;
  await new Promise<void>((resolveClosed) =>
    server.close(() => resolveClosed()),
  );
  return port;
}

async function createIsolatedDatabase(): Promise<IsolatedDatabase> {
  if (process.env.TEST_POSTGRES_ADMIN_URL) {
    const admin = new Client({
      connectionString: process.env.TEST_POSTGRES_ADMIN_URL,
    });
    const database = `comet_test_${randomUUID().replaceAll("-", "")}`;
    await admin.connect();
    try {
      await admin.query(`CREATE DATABASE "${database}"`);
    } catch (error) {
      await admin.end();
      throw error;
    }
    const url = new URL(process.env.TEST_POSTGRES_ADMIN_URL);
    url.pathname = `/${database}`;
    return {
      url: url.toString(),
      close: async () => {
        try {
          await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
        } finally {
          await admin.end();
        }
      },
    };
  }

  const tempRoot = resolve(process.cwd(), ".tmp");
  await mkdir(tempRoot, { recursive: true });
  const clusterRoot = await mkdtemp(join(tempRoot, "postgres-"));
  if (!clusterRoot.startsWith(tempRoot + sep))
    throw new Error("Unsafe temporary database path");
  const databaseDir = join(clusterRoot, "data");
  const port = await availablePort();
  const password = randomBytes(24).toString("hex");
  const pg = new EmbeddedPostgres({
    databaseDir,
    port,
    user: "postgres",
    password,
    persistent: false,
    onLog: () => undefined,
    onError: () => undefined,
  });
  let stage = "initialise";
  try {
    await pg.initialise();
    stage = "start";
    if (process.platform === "win32") {
      await restrictedPgCtl(clusterRoot, databaseDir, port, "start");
    } else {
      await pg.start();
    }
    stage = "create database";
    const admin = new Client({
      host: "127.0.0.1",
      port,
      user: "postgres",
      password,
      database: "postgres",
    });
    await admin.connect();
    try {
      await admin.query("CREATE DATABASE comet_test");
    } finally {
      await admin.end();
    }
  } catch (error) {
    console.error(`Isolated PostgreSQL ${stage} failed`);
    try {
      if (process.platform === "win32") {
        await restrictedPgCtl(clusterRoot, databaseDir, port, "stop");
      } else {
        await pg.stop();
      }
    } catch {
      // The cluster may not have started.
    }
    await rm(clusterRoot, { recursive: true, force: true });
    throw error;
  }
  return {
    url: `postgresql://postgres:${password}@127.0.0.1:${port}/comet_test`,
    close: async () => {
      if (process.platform === "win32") {
        await restrictedPgCtl(clusterRoot, databaseDir, port, "stop");
      } else {
        await pg.stop();
      }
      await rm(clusterRoot, { recursive: true, force: true });
    },
  };
}

async function main() {
  const suite = process.argv[2];
  if (!["integration", "e2e", "a11y"].includes(suite))
    throw new Error("Unknown test suite");
  const database = await createIsolatedDatabase();
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: database.url,
    AUTH_SECRET: randomBytes(48).toString("hex"),
    APP_URL:
      suite === "integration"
        ? "http://localhost:3000"
        : "https://study.example.test",
    NODE_ENV: suite === "integration" ? "test" : "production",
    DATA_MODE: "disabled",
    EMAIL_PROVIDER: "disabled",
    COMET_ISOLATED_TEST_DB: "1",
  };
  try {
    if (suite === "integration") {
      run(
        [resolve("node_modules/vitest/vitest.mjs"), "run", "tests/integration"],
        env,
      );
    } else {
      const db = createDatabaseClient(database.url);
      try {
        await runMigrations(db);
      } finally {
        await db.close();
      }
      run([resolve("node_modules/next/dist/bin/next"), "build"], env);
      run(
        [
          resolve("node_modules/@playwright/test/cli.js"),
          "test",
          ...(suite === "a11y" ? ["--grep", "@a11y"] : []),
        ],
        env,
      );
    }
  } finally {
    await database.close();
  }
}

main().catch(() => {
  console.error("Isolated PostgreSQL test run failed");
  process.exit(1);
});
