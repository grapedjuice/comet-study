/**
 * Local development database: a persistent embedded PostgreSQL under .data/.
 *   npm run db:dev         start (initialising on first run), migrate, wire .env
 *   npm run db:dev -- stop stop the cluster
 */
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Client } from "pg";
import { createDatabaseClient, runMigrations } from "../lib/db";
import { restrictedPgCtl } from "./pg-ctl";

const PORT = 54329;
const DATABASE = "comet_dev";
const root = resolve(process.cwd(), ".data/postgres");
const dataDir = join(root, "data");
const secretFile = join(root, "password");
const envFile = resolve(process.cwd(), ".env");

async function canConnect(password: string) {
  const client = new Client({
    host: "127.0.0.1",
    port: PORT,
    user: "postgres",
    password,
    database: "postgres",
    connectionTimeoutMillis: 1000,
  });
  try {
    await client.connect();
    return client;
  } catch {
    return null;
  }
}

async function setEnv(values: Record<string, string>, onlyIfEmpty: string[]) {
  let text = existsSync(envFile)
    ? await readFile(envFile, "utf8")
    : await readFile(resolve(process.cwd(), ".env.example"), "utf8");
  for (const [key, value] of Object.entries(values)) {
    const pattern = new RegExp(`^${key}=(.*)$`, "m");
    const current = text.match(pattern);
    if (current && onlyIfEmpty.includes(key) && current[1].trim()) continue;
    text = current
      ? text.replace(pattern, `${key}=${value}`)
      : `${text.trimEnd()}\n${key}=${value}\n`;
  }
  await writeFile(envFile, text);
}

async function main() {
  const stop = process.argv[2] === "stop";
  await mkdir(root, { recursive: true });
  const firstRun = !existsSync(dataDir);
  const password = firstRun
    ? randomBytes(24).toString("hex")
    : (await readFile(secretFile, "utf8")).trim();
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    port: PORT,
    user: "postgres",
    password,
    persistent: true,
    onLog: () => undefined,
    onError: () => undefined,
  });

  if (stop) {
    if (process.platform === "win32")
      await restrictedPgCtl(root, dataDir, PORT, "stop");
    else await pg.stop();
    console.log("Development PostgreSQL stopped.");
    return;
  }

  if (firstRun) {
    await pg.initialise();
    await writeFile(secretFile, password);
  }
  let admin = await canConnect(password);
  if (!admin) {
    if (process.platform === "win32")
      await restrictedPgCtl(root, dataDir, PORT, "start");
    else await pg.start();
    admin = await canConnect(password);
    if (!admin) throw new Error("PostgreSQL did not accept connections");
  }
  try {
    const exists = await admin.query(
      "select 1 from pg_database where datname = $1",
      [DATABASE],
    );
    if (!exists.rowCount) await admin.query(`CREATE DATABASE ${DATABASE}`);
  } finally {
    await admin.end();
  }

  const url = `postgresql://postgres:${password}@127.0.0.1:${PORT}/${DATABASE}`;
  const db = createDatabaseClient(url);
  try {
    await runMigrations(db);
  } finally {
    await db.close();
  }
  await setEnv(
    {
      DATABASE_URL: url,
      AUTH_SECRET: randomBytes(48).toString("base64url"),
      APP_URL: "http://localhost:3000",
      EMAIL_PROVIDER: "console",
    },
    ["AUTH_SECRET"],
  );
  console.log(
    `Development PostgreSQL ready on 127.0.0.1:${PORT}/${DATABASE}; .env updated (EMAIL_PROVIDER=console). Restart \`npm run dev\` to pick it up.`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
