import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { expect, it } from "vitest";

it("rejects an insecure production origin before starting and redacts secret values", () => {
  const secret = "db-secret-value-never-log";
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", resolve("scripts/start.ts")],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        DATABASE_URL: `postgresql://postgres:${secret}@127.0.0.1:5432/test`,
        AUTH_SECRET:
          "e8c31e81a9f34e2d6b84b6fa2987091ff8115238244baa29f12ec42ee1547dbd",
        APP_URL: "http://example.test",
        DATA_MODE: "disabled",
        EMAIL_PROVIDER: "disabled",
      },
      timeout: 5000,
    },
  );
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("APP_URL");
  expect(result.stderr).not.toContain(secret);
});
