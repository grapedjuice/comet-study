import { z } from "zod";
import { apiError, isSameOrigin, ok, readJson } from "../../../../../lib/api";
import {
  addUserCourses,
  currentTerm,
  ensureCatalog,
  listUserCourses,
  MAX_COURSES,
  resolveCourseChoices,
  termLabel,
} from "../../../../../lib/courses";
import { currentUserContext } from "../../../../../lib/request-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    courses: z
      .array(
        z
          .object({
            code: z.string().trim().min(4).max(12),
            section: z.string().trim().max(4).nullish(),
          })
          .strict(),
      )
      .min(1)
      .max(MAX_COURSES),
    source: z.enum(["search", "import"]).default("search"),
  })
  .strict();

const unavailable = () =>
  apiError("SERVICE_UNAVAILABLE", "Courses are temporarily unavailable", 503);

export async function GET() {
  try {
    const { db, user } = await currentUserContext();
    if (!user) return apiError("UNAUTHENTICATED", "Sign in first", 401);
    const term = currentTerm();
    return ok({
      term,
      termLabel: termLabel(term),
      courses: await listUserCourses(db, user.id, term),
    });
  } catch {
    return unavailable();
  }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request))
    return apiError("FORBIDDEN_ORIGIN", "Cross-site request rejected", 403);
  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success)
    return apiError("INVALID_REQUEST", "Choose at least one course", 422);
  try {
    const { db, user, nebula } = await currentUserContext();
    if (!user) return apiError("UNAUTHENTICATED", "Sign in first", 401);
    await ensureCatalog(db, nebula);
    const term = currentTerm();
    const { choices, unknown, sectionMissing } = await resolveCourseChoices(
      db,
      nebula,
      term,
      parsed.data.courses,
      parsed.data.source,
    );
    if (!choices.length)
      return apiError(
        "UNKNOWN_COURSE",
        `We couldn’t find ${unknown.join(", ")} in the UTD catalog`,
        422,
      );
    await addUserCourses(db, user.id, term, choices);
    return ok({
      courses: await listUserCourses(db, user.id, term),
      unknown,
      sectionMissing,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "TOO_MANY_COURSES")
      return apiError(
        "TOO_MANY_COURSES",
        `You can add up to ${MAX_COURSES} courses per term`,
        422,
      );
    return unavailable();
  }
}
