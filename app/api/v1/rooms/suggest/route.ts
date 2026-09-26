import { apiError, ok } from "../../../../../lib/api";
import { currentUserContext } from "../../../../../lib/request-context";
import {
  listCampusRooms,
  roomDay,
  suggestRooms,
} from "../../../../../lib/rooms";
import { isDateString } from "../../../../../lib/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const minute = (value: string | null) => {
  const match = value?.match(/^(\d{2}):(\d{2})$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};

/**
 * Room suggestions for "where" fields. With a date and times, each room says
 * whether the connected schedules show it free then.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const q = (params.get("q") ?? "").slice(0, 40);
  const date = params.get("date");
  const from = minute(params.get("from"));
  const to = minute(params.get("to"));
  try {
    const { user, nebula } = await currentUserContext();
    if (!user) return apiError("UNAUTHENTICATED", "Sign in first", 401);
    if (!nebula) return ok({ groups: [], timed: false });
    const timed =
      isDateString(date) && from !== null && to !== null && to > from;
    const rooms = timed
      ? (await roomDay(nebula, date)).rooms.map((room) => ({
          building: room.building,
          room: room.room,
          capacity: room.capacity,
          free: !room.busy.some((b) => b.start < to && b.end > from),
        }))
      : await listCampusRooms(nebula);
    return ok({ groups: suggestRooms(rooms, q), timed });
  } catch {
    return apiError(
      "ROOMS_UNAVAILABLE",
      "Room suggestions aren’t available right now",
      503,
    );
  }
}
