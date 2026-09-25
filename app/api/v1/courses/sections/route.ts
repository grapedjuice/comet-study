import { apiError, ok } from "../../../../../lib/api";
import {
  currentTerm,
  findCatalogCourses,
  normalizeCode,
  termSections,
} from "../../../../../lib/courses";
import { currentUserContext } from "../../../../../lib/request-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const code = normalizeCode(
    new URL(request.url).searchParams.get("code") ?? "",
  );
  if (!code) return apiError("INVALID_REQUEST", "Unknown course code", 422);
  try {
    const { db, user, nebula } = await currentUserContext();
    if (!user) return apiError("UNAUTHENTICATED", "Sign in first", 401);
    const course = (await findCatalogCourses(db, [code])).get(code);
    if (!course) return apiError("NOT_FOUND", "Course not found", 404);
    const term = currentTerm();
    if (!nebula) return ok({ term, sections: [], live: false });
    return ok({
      term,
      sections: await termSections(nebula, course.nebulaId, term),
      live: true,
    });
  } catch {
    return apiError(
      "SECTIONS_UNAVAILABLE",
      "Section times aren’t available right now — you can add the course without one",
      503,
    );
  }
}
