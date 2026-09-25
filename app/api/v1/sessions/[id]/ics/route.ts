import { isUuid } from "../../../../../../lib/app-errors";
import { apiError } from "../../../../../../lib/api";
import { buildIcs } from "../../../../../../lib/calendar";
import { membership } from "../../../../../../lib/groups";
import { currentUserContext } from "../../../../../../lib/request-context";
import { getSession } from "../../../../../../lib/sessions";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isUuid(id)) return apiError("NOT_FOUND", "Session not found", 404);
  try {
    const { db, user } = await currentUserContext();
    if (!user) return apiError("UNAUTHENTICATED", "Sign in first", 401);
    const session = await getSession(db, user.id, id);
    const member =
      session && (await membership(db.pool, session.groupId, user.id));
    if (!session || member?.status !== "active")
      return apiError("NOT_FOUND", "Session not found", 404);
    const host = new URL(request.url).host;
    const body = buildIcs([
      {
        uid: `session-${session.id}@${host}`,
        title: `${session.title} · ${session.courseCode}`,
        startsAt: session.startsAt,
        endsAt: session.endsAt,
        location: session.location,
        description: `${session.groupName} on Comet Study`,
        sequence: session.sequence,
        cancelled: session.status === "cancelled",
      },
    ]);
    return new Response(body, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="comet-study-session.ics"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return apiError(
      "SERVICE_UNAVAILABLE",
      "Calendar is temporarily unavailable",
      503,
    );
  }
}
