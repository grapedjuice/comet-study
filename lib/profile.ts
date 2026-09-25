import { z } from "zod";
import type { createDatabaseClient } from "./db";

type Database = ReturnType<typeof createDatabaseClient>;

/** What classmates see: letters, spaces, apostrophes, hyphens, periods. */
export const DisplayName = z
  .string()
  .trim()
  .min(1, "Tell us what to call you")
  .max(40, "Keep it under 40 characters")
  .regex(/^[\p{L}\p{M}][\p{L}\p{M}' .-]*$/u, "Use letters, spaces, ' or -")
  .transform((value) => value.replace(/\s+/g, " "));

export async function updateName(db: Database, userId: string, name: string) {
  await db.pool.query(
    "update users set name = $1, updated_at = now() where id = $2",
    [name, userId],
  );
}

/** Finish onboarding once the student has a name and at least one course. */
export async function completeOnboarding(
  db: Database,
  userId: string,
  term: string,
) {
  const result = await db.pool.query<{ name: string | null; courses: string }>(
    `select u.name, (select count(*) from user_courses c
                      where c.user_id = u.id and c.term = $2) as courses
       from users u where u.id = $1`,
    [userId, term],
  );
  const row = result.rows[0];
  if (!row?.name) throw new Error("NAME_REQUIRED");
  if (!Number(row.courses)) throw new Error("COURSES_REQUIRED");
  await db.pool.query(
    "update users set onboarding_completed_at = coalesce(onboarding_completed_at, now()), updated_at = now() where id = $1",
    [userId],
  );
}
