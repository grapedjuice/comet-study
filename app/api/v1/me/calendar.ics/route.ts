import { apiError } from "../../../../../lib/api";
import { buildIcs } from "../../../../../lib/calendar";
import { currentUserContext } from "../../../../../lib/request-context";
import { listMyExams, listMySessions } from "../../../../../lib/sessions";

export const runtime = "nodejs";

/** Every session and exam in the student's groups, past month to six months out. */
export async function GET(request: Request) {
  try {
    const { db, user } = await currentUserContext();
    if (!user) return apiError("UNAUTHENTICATED", "Sign in first", 401);
    const now = Date.now();
    const from = new Date(now - 30 * 86400000);
    const to = new Date(now + 183 * 86400000);
    const [sessions, exams] = await Promise.all([
      listMySessions(db, user.id, from, to, { includeCancelled: true }),
      listMyExams(db, user.id, from, to),
    ]);
    const host = new URL(request.url).host;
    const body = buildIcs(
      [
        ...sessions.map((s) => ({
          uid: `session-${s.id}@${host}`,
          title: `${s.title} · ${s.courseCode}`,
          startsAt: s.startsAt,
          endsAt: s.endsAt,
          location: s.location,
          description: `${s.groupName} on Comet Study`,
          sequence: s.sequence,
          cancelled: s.status === "cancelled",
        })),
        ...exams.map((e) => ({
          uid: `exam-${e.id}@${host}`,
          title: `${e.courseCode} ${e.label}`,
          startsAt: e.startsAt,
          endsAt: e.endsAt ?? new Date(e.startsAt.getTime() + 75 * 60000),
          location: e.location,
          description: `Reported by classmates (${e.badge}, ${e.confirms} confirmed). Check your syllabus.`,
        })),
      ],
      "Comet Study",
    );
    return new Response(body, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="comet-study.ics"`,
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
