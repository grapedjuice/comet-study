import Link from "next/link";
import type { NebulaClient } from "@/lib/nebula";
import { CLOSE_MINUTE, findFreeRooms, roomDay } from "@/lib/rooms";
import { campusDate, campusMinutes, formatClock } from "@/lib/time";

/** The few rooms free for at least the next hour, from live campus data. */
export async function FreeRoomsNow({
  nebula,
  now,
}: {
  nebula: NebulaClient | null;
  now: Date;
}) {
  if (!nebula)
    return (
      <p className="muted-note">
        Live room data isn’t connected on this server.
      </p>
    );
  const minute = campusMinutes(now);
  const from = Math.max(minute - (minute % 15), 7 * 60);
  if (from + 60 > CLOSE_MINUTE)
    return (
      <p className="muted-note">
        Campus is winding down for the night.{" "}
        <Link className="text-link" href="/rooms?day=1">
          See tomorrow’s rooms →
        </Link>
      </p>
    );
  let rooms;
  try {
    const day = await roomDay(nebula, campusDate(now));
    rooms = findFreeRooms(day.rooms, { from, to: from + 60 }).filter(
      (room) => room.capacity === null || room.capacity <= 60,
    );
  } catch {
    return <p className="muted-note">Room data is unavailable right now.</p>;
  }
  if (!rooms.length)
    return (
      <p className="muted-note">
        Every known room is booked for the next hour.
      </p>
    );
  return (
    <>
      <ul className="free-now">
        {rooms.slice(0, 4).map((room) => (
          <li key={room.key}>
            <Link href={`/rooms?building=${encodeURIComponent(room.building)}`}>
              <span className="free-room">
                {room.building} <strong>{room.room}</strong>
              </span>
              <span className="free-until">
                until {formatClock(room.freeUntil)}
                {room.capacity ? ` · ${room.capacity} seats` : ""}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="fine-print">
        No known class or reservation — not a guarantee it’s open.
      </p>
    </>
  );
}

export function RoomsSkeleton() {
  return (
    <ul className="free-now" aria-busy="true" aria-label="Loading rooms">
      {Array.from({ length: 4 }, (_, i) => (
        <li key={i} className="skeleton-row" />
      ))}
    </ul>
  );
}
