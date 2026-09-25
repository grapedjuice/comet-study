import { apiError, isSameOrigin, ok } from "../../../../../../lib/api";
import { removeUserCourse } from "../../../../../../lib/courses";
import { currentUserContext } from "../../../../../../lib/request-context";

export const runtime = "nodejs";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isSameOrigin(request))
    return apiError("FORBIDDEN_ORIGIN", "Cross-site request rejected", 403);
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id))
    return apiError("NOT_FOUND", "Course not found", 404);
  try {
    const { db, user } = await currentUserContext();
    if (!user) return apiError("UNAUTHENTICATED", "Sign in first", 401);
    if (!(await removeUserCourse(db, user.id, id)))
      return apiError("NOT_FOUND", "Course not found", 404);
    return ok({ removed: true });
  } catch {
    return apiError(
      "SERVICE_UNAVAILABLE",
      "Courses are temporarily unavailable",
      503,
    );
  }
}
