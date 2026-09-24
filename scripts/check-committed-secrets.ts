import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const files = execFileSync("git", [
  "ls-files",
  "--cached",
  "--others",
  "--exclude-standard",
  "-z",
])
  .toString("utf8")
  .split("\0")
  .filter(Boolean);
const assignments =
  /^(?:DATABASE_URL|AUTH_SECRET|NEBULA_API_KEY|RESEND_API_KEY|SENDGRID_API_KEY|S3_SECRET_ACCESS_KEY|UTD_OIDC_CLIENT_SECRET)[ \t]*=[ \t]*\S+/m;
const publicSecrets = /NEXT_PUBLIC_[A-Z_]*(?:SECRET|TOKEN|PRIVATE_KEY)\s*[=:]/;
const privateKey = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/;
const awsKey = /\bAKIA[0-9A-Z]{16}\b/;
const findings: string[] = [];

for (const file of files) {
  if (!/\.(?:ts|tsx|js|mjs|json|md|yml|yaml|env|example)$/.test(file)) continue;
  const content = readFileSync(file, "utf8");
  if (
    assignments.test(content) ||
    publicSecrets.test(content) ||
    privateKey.test(content) ||
    awsKey.test(content)
  ) {
    findings.push(file);
  }
}

if (findings.length) {
  console.error(`Potential committed secret in: ${findings.join(", ")}`);
  process.exitCode = 1;
} else {
  console.log(`Secret pattern scan clear (${files.length} files checked)`);
}
