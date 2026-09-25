import { apiError, isSameOrigin, ok } from "../../../../../lib/api";
import { currentTerm } from "../../../../../lib/courses";
import { completeOnboarding } from "../../../../../lib/profile";
import { currentUserContext } from "../../../../../lib/request-context";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isSameOrigin(request))
    return apiError("FORBIDDEN_ORIGIN", "Cross-site request rejected", 403);
  try {
    const { db, user } = await currentUserContext();
    if (!user) return apiError("UNAUTHENTICATED", "Sign in first", 401);
    await completeOnboarding(db, user.id, currentTerm());
    return ok({ onboardingCompleted: true });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "NAME_REQUIRED")
      return apiError(code, "Add your name first", 422);
    if (code === "COURSES_REQUIRED")
      return apiError(code, "Add at least one course first", 422);
    return apiError(
      "SERVICE_UNAVAILABLE",
      "Your profile is temporarily unavailable",
      503,
    );
  }
}
