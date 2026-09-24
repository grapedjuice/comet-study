import { parseEnv } from "../lib/env";

try {
  parseEnv(process.env);
  console.log("Environment valid");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Environment invalid");
  process.exitCode = 1;
}
