import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { parseEnv } from "../lib/env";

try {
  parseEnv({ ...process.env, NODE_ENV: "production" });
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Invalid production environment",
  );
  process.exit(1);
}

const child = spawn(
  process.execPath,
  [
    resolve("node_modules/next/dist/bin/next"),
    "start",
    ...process.argv.slice(2),
  ],
  { stdio: "inherit", env: { ...process.env, NODE_ENV: "production" } },
);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => child.kill(signal));
}
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
