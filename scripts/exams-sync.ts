/** Refresh exam windows and exam dates from UTD's schedule: `npm run exams:sync`. */
import { syncCampusExams } from "../lib/campus-exams";
import { createDatabaseClient } from "../lib/db";
import { parseEnv } from "../lib/env";
import { createNebulaClient } from "../lib/nebula";

async function main() {
  const env = parseEnv({ ...process.env });
  if (!env.NEBULA_API_KEY) throw new Error("NEBULA_API_KEY is not set");
  const db = createDatabaseClient(env.DATABASE_URL);
  try {
    const started = Date.now();
    const result = await syncCampusExams(
      db,
      createNebulaClient(env.NEBULA_API_KEY),
    );
    console.log(
      `Synced ${result.finals} finals, ${result.departmentExams} booked exams and ${result.testingCenterExams ?? "no (list unavailable)"} Testing Center exams from ${result.days} days (${result.failedDays} failed, ${result.windows} exam windows) in ${Date.now() - started}ms.`,
    );
  } finally {
    await db.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
