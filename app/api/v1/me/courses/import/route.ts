import { z } from "zod";
import {
  apiError,
  isSameOrigin,
  ok,
  readJson,
} from "../../../../../../lib/api";
import {
  currentTerm,
  ensureCatalog,
  extractCourseCodes,
  resolveCourseChoices,
} from "../../../../../../lib/courses";
import { currentUserContext } from "../../../../../../lib/request-context";

export const runtime = "nodejs";

const bodySchema = z.object({ text: z.string().min(1).max(20_000) }).strict();

/** Preview only: detects and verifies courses in pasted text, adds nothing. */
export async function POST(request: Request) {
  if (!isSameOrigin(request))
    return apiError("FORBIDDEN_ORIGIN", "Cross-site request rejected", 403);
  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success)
    return apiError("INVALID_REQUEST", "Paste your class schedule first", 422);
  try {
    const { db, user, nebula } = await currentUserContext();
    if (!user) return apiError("UNAUTHENTICATED", "Sign in first", 401);
    await ensureCatalog(db, nebula);
    const detected = extractCourseCodes(parsed.data.text).slice(0, 40);
    const term = currentTerm();
    const { choices } = await resolveCourseChoices(
      db,
      nebula,
      term,
      detected,
      "import",
    );
    const sections = new Map(detected.map((item) => [item.code, item.section]));
    return ok({
      term,
      found: choices.map((choice) => ({
        code: choice.code,
        title: choice.title,
        section: choice.section?.number ?? sections.get(choice.code) ?? null,
        schedule: choice.section?.schedule ?? null,
        instructor: choice.section?.instructor ?? null,
        verifiedSection: Boolean(choice.section),
      })),
    });
  } catch {
    return apiError(
      "SERVICE_UNAVAILABLE",
      "Import is temporarily unavailable",
      503,
    );
  }
}
