import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

/**
 * Windows refuses to run PostgreSQL from an elevated token, so pg_ctl is
 * launched through runas with a basic-user trust level.
 */
export async function restrictedPgCtl(
  clusterRoot: string,
  databaseDir: string,
  port: number,
  action: "start" | "stop",
) {
  const pgCtl = resolve(
    process.cwd(),
    "node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe",
  );
  const marker = join(clusterRoot, `${action}.exit`);
  const script = join(clusterRoot, `${action}.cmd`);
  const command =
    action === "start"
      ? `"${pgCtl}" -D "${databaseDir}" -l "${join(clusterRoot, "postgres.log")}" -o "-p ${port}" -w start`
      : `"${pgCtl}" -D "${databaseDir}" -m immediate -w stop`;
  await writeFile(
    script,
    `@echo off\r\n${command} > "${join(clusterRoot, `${action}.log`)}" 2>&1\r\necho %errorlevel% > "${marker}"\r\n`,
  );
  const launched = spawnSync(
    "runas",
    ["/trustlevel:0x20000", `cmd /c ${script}`],
    {
      stdio: "ignore",
      shell: false,
    },
  );
  if (launched.status !== 0)
    throw new Error("Could not launch restricted PostgreSQL process");
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const code = (await readFile(marker, "utf8")).trim();
      if (code !== "0") throw new Error(`PostgreSQL ${action} failed`);
      return;
    } catch (error) {
      if (error instanceof Error && error.message.includes("failed"))
        throw error;
      await new Promise((resolveWait) => setTimeout(resolveWait, 500));
    }
  }
  throw new Error(`PostgreSQL ${action} timed out`);
}
