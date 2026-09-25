import { z } from "zod";
import { apiError, isSameOrigin, ok, readJson } from "../../../../lib/api";
import { DisplayName, updateName } from "../../../../lib/profile";
import { currentUserContext } from "../../../../lib/request-context";

export const runtime = "nodejs";

const bodySchema = z.object({ name: DisplayName }).strict();

export async function PATCH(request: Request) {
  if (!isSameOrigin(request))
    return apiError("FORBIDDEN_ORIGIN", "Cross-site request rejected", 403);
  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success) {
    const message =
      parsed.error.issues[0]?.message ?? "Tell us what to call you";
    return apiError("INVALID_REQUEST", message, 422, { name: message });
  }
  try {
    const { db, user } = await currentUserContext();
    if (!user) return apiError("UNAUTHENTICATED", "Sign in first", 401);
    await updateName(db, user.id, parsed.data.name);
    return ok({ name: parsed.data.name });
  } catch {
    return apiError(
      "SERVICE_UNAVAILABLE",
      "Your profile is temporarily unavailable",
      503,
    );
  }
}
