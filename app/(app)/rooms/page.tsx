import type { Metadata } from "next";
import Link from "next/link";
import { isUuid } from "@/lib/app-errors";
import { requireStudent } from "@/lib/app-session";
import { listMyGroups } from "@/lib/groups";
import {
  buildingsIn,
  CLOSE_MINUTE,
  FEED_LABELS,
  findFreeRooms,
  OPEN_MINUTE,
  ROOM_DISCLAIMER,
  roomDay,
  type RoomResult,
} from "@/lib/rooms";
import {
  addDays,
  campusDate,
  campusMinutes,
  campusToUtc,
  formatClock,
  formatDay,
  isDateString,
  TZ_LABEL,
} from "@/lib/time";
import { Badge, Empty, PageHeader, Panel } from "../ui/bits";
import { GlassSelect } from "../ui/glass-select";
import { Icon } from "../ui/icons";

export const metadata: Metadata = { title: "Find a room — Comet Study" };

type Search = {
  date?: string;
  from?: string;
  to?: string;
  building?: string;
  cap?: string;
  day?: string;
  group?: string;
  more?: string;
};

const hhmm = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const toMinutes = (value: string | undefined) => {
  const match = value?.match(/^(\d{2}):(\d{2})$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};

export default async function RoomsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const { db, user, term, nebula } = await requireStudent();
  const [search, groups] = await Promise.all([
    searchParams,
    listMyGroups(db, user.id, term),
  ]);
  const myGroups = groups.filter((g) => g.myStatus === "active");
  const now = new Date();
  const today = campusDate(now);
  const lastDay = addDays(today, 13);

  // Defaults: the next free hour today, or tomorrow morning when it's late.
  const nowMinute = campusMinutes(now);
  const late = nowMinute + 60 > CLOSE_MINUTE - 60;
  let date =
    isDateString(search.date) && search.date >= today && search.date <= lastDay
      ? search.date
      : today;
  if (!search.date && (late || search.day === "1")) date = addDays(today, 1);
  const soon = Math.max(OPEN_MINUTE, Math.ceil(nowMinute / 15) * 15);
  const defaultFrom =
    date === today && !late ? Math.min(soon, CLOSE_MINUTE - 60) : 10 * 60;
  let from = toMinutes(search.from) ?? defaultFrom;
  let to = toMinutes(search.to) ?? from + 60;
  from = Math.min(Math.max(from, OPEN_MINUTE), CLOSE_MINUTE - 15);
  to = Math.min(Math.max(to, from + 15), CLOSE_MINUTE);
  const minCapacity = Number(search.cap) || 0;
  const group = isUuid(search.group)
    ? myGroups.find((g) => g.id === search.group)
    : undefined;

  let day: Awaited<ReturnType<typeof roomDay>> | null = null;
  if (nebula) day = await roomDay(nebula, date).catch(() => null);
  const buildings = day ? buildingsIn(day.rooms) : [];
  const building = buildings.some((b) => b.code === search.building)
    ? search.building
    : undefined;
  const results = day
    ? findFreeRooms(day.rooms, { from, to, building, minCapacity })
    : [];
  const shown = results.slice(0, search.more ? 200 : 40);
  const failed = day?.feeds.filter((f) => !f.ok) ?? [];
  const dates = Array.from({ length: 14 }, (_, i) => addDays(today, i));
  const past = date === today && to <= nowMinute;

  const query = (overrides: Partial<Search>) => {
    const params = new URLSearchParams();
    const merged = {
      date,
      from: hhmm(from),
      to: hhmm(to),
      building,
      cap: minCapacity ? String(minCapacity) : undefined,
      group: group?.id,
      ...overrides,
    };
    for (const [key, value] of Object.entries(merged))
      if (value) params.set(key, value);
    return `/rooms?${params}`;
  };

  return (
    <main id="main" className="app-page" tabIndex={-1}>
      <PageHeader kicker="Rooms on campus" title="Find a" accent="free room.">
        <p>
          Live from UTD’s class schedule and room reservations via Nebula Labs.
          {group ? (
            <>
              {" "}
              Picking a room for <strong>{group.name}</strong>.
            </>
          ) : null}
        </p>
      </PageHeader>

      <form className="room-search panel" action="/rooms" method="get">
        {group ? <input type="hidden" name="group" value={group.id} /> : null}
        <GlassSelect
          label="Day"
          name="date"
          defaultValue={date}
          options={dates.map((d) => ({
            value: d,
            label:
              d === today
                ? "Today"
                : d === addDays(today, 1)
                  ? "Tomorrow"
                  : formatDay(campusToUtc(d, "12:00")!),
          }))}
        />
        <label className="form-field">
          <span className="field-label">From</span>
          <input
            className="field"
            type="time"
            name="from"
            step={900}
            min="07:00"
            max="22:45"
            defaultValue={hhmm(from)}
          />
        </label>
        <label className="form-field">
          <span className="field-label">Until</span>
          <input
            className="field"
            type="time"
            name="to"
            step={900}
            min="07:15"
            max="23:00"
            defaultValue={hhmm(to)}
          />
        </label>
        <GlassSelect
          label="Building"
          name="building"
          defaultValue={building ?? ""}
          options={[
            { value: "", label: "Anywhere" },
            ...buildings.map((b) => ({
              value: b.code,
              label: b.code,
              hint: b.name ?? undefined,
            })),
          ]}
        />
        <GlassSelect
          label="Seats"
          name="cap"
          defaultValue={String(minCapacity)}
          options={[
            { value: "0", label: "Any size" },
            ...[4, 8, 15, 30].map((n) => ({
              value: String(n),
              label: `${n}+ seats`,
            })),
          ]}
        />
        <button className="button primary" type="submit">
          <Icon name="search" size={18} /> <span>Search</span>
        </button>
      </form>

      {!nebula ? (
        <Panel>
          <Empty title="Room data isn’t connected here">
            This server runs without live Nebula data, so rooms can’t be
            searched.
          </Empty>
        </Panel>
      ) : !day ? (
        <Panel>
          <Empty
            title="Couldn’t reach campus room data"
            action={{ href: query({}), label: "Try again" }}
          >
            Nebula Labs didn’t respond. Nothing is shown rather than guessing.
          </Empty>
        </Panel>
      ) : (
        <Panel
          title={`${results.length} ${results.length === 1 ? "room" : "rooms"} free · ${formatClock(from)}–${formatClock(to)}`}
          icon="rooms"
          id="results"
          action={<span className="muted-note">{TZ_LABEL}</span>}
        >
          {failed.length ? (
            <p className="notice warn" role="status">
              <Icon name="bell" size={16} /> Partial data:{" "}
              {failed.map((f) => FEED_LABELS[f.feed]).join(", ")} didn’t load.
              Treat these as suggestions.
            </p>
          ) : null}
          {past ? (
            <p className="notice">That time has already passed today.</p>
          ) : null}
          <p className="fine-print disclaimer">{ROOM_DISCLAIMER}</p>
          {shown.length ? (
            <ul className="room-list">
              {shown.map((room) => (
                <RoomRow
                  key={room.key}
                  room={room}
                  from={from}
                  to={to}
                  date={date}
                  group={group}
                  myGroups={myGroups}
                />
              ))}
            </ul>
          ) : (
            <Empty title="No known free rooms for that window">
              Try a shorter window, another building, or a smaller size.
            </Empty>
          )}
          {results.length > shown.length ? (
            <Link
              className="button ghost small more-link"
              href={query({ more: "1" })}
            >
              Show all {results.length}
            </Link>
          ) : null}
        </Panel>
      )}
    </main>
  );
}

const SPAN = CLOSE_MINUTE - OPEN_MINUTE;
const pct = (minute: number) =>
  `${(((minute - OPEN_MINUTE) / SPAN) * 100).toFixed(2)}%`;

function RoomRow({
  room,
  from,
  to,
  date,
  group,
  myGroups,
}: {
  room: RoomResult;
  from: number;
  to: number;
  date: string;
  group?: { id: string; name: string };
  myGroups: { id: string; name: string; courseCode: string }[];
}) {
  const label = `${room.building} ${room.room}`;
  const pick = (groupId: string) =>
    `/groups/${groupId}?tab=sessions&room=${encodeURIComponent(label)}&date=${date}&start=${hhmm(from)}&end=${hhmm(to)}`;
  return (
    <li className="room-row">
      <div className="room-name">
        <p>
          {room.building} <strong>{room.room}</strong>
        </p>
        <span>{room.buildingName ?? "Campus building"}</span>
      </div>
      <div className="room-facts">
        <Badge tone="good">
          Free {formatClock(room.freeFrom)}–{formatClock(room.freeUntil)}
        </Badge>
        <span>{room.capacity ? `${room.capacity} seats` : "Size unknown"}</span>
        {room.tracked ? null : <span>No bookings on record today</span>}
        {room.nextBusy ? (
          <span>
            Next: {room.nextBusy.label ?? "booked"} at{" "}
            {formatClock(room.nextBusy.start)}
          </span>
        ) : null}
      </div>
      <div className="room-timeline" aria-hidden="true">
        {room.busy.map((b, i) => (
          <i
            key={i}
            className="busy"
            style={{
              left: pct(Math.max(b.start, OPEN_MINUTE)),
              width: `calc(${pct(Math.min(b.end, CLOSE_MINUTE))} - ${pct(Math.max(b.start, OPEN_MINUTE))})`,
            }}
          />
        ))}
        <i
          className="want"
          style={{ left: pct(from), width: `calc(${pct(to)} - ${pct(from)})` }}
        />
      </div>
      <div className="room-action">
        {group ? (
          <Link className="button primary small" href={pick(group.id)}>
            Use for {group.name}
          </Link>
        ) : myGroups.length === 1 ? (
          <Link className="button ghost small" href={pick(myGroups[0].id)}>
            Plan a session here
          </Link>
        ) : myGroups.length ? (
          <details className="menu">
            <summary className="button ghost small">
              Plan a session here
            </summary>
            <div className="menu-list">
              {myGroups.map((g) => (
                <Link key={g.id} href={pick(g.id)}>
                  {g.courseCode} · {g.name}
                </Link>
              ))}
            </div>
          </details>
        ) : null}
      </div>
    </li>
  );
}
