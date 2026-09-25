import type { NebulaClient, NebulaDayBuildings } from "./nebula";
import { parseClock } from "./time";

export const ROOM_DISCLAIMER =
  "“Available” means no known scheduled class or reservation appears in the connected data. It does not guarantee that a room is physically empty, open, unlocked, or permitted for your use.";

/** Search bounds for a campus day: 7am–11pm. */
export const OPEN_MINUTE = 7 * 60;
export const CLOSE_MINUTE = 23 * 60;

const FEEDS = ["events", "astra", "mazevo"] as const;
type Feed = (typeof FEEDS)[number];
export const FEED_LABELS: Record<Feed, string> = {
  events: "Class schedule",
  astra: "Academic reservations",
  mazevo: "Student Union reservations",
};

export const BUILDING_NAMES: Record<string, string> = {
  AB: "Arts & Humanities",
  AD: "Administration",
  APC1: "Arts & Performance",
  ATC: "Arts & Technology",
  BE: "Berkner Hall",
  BSB: "Bioengineering & Sciences",
  CB: "Classroom Building",
  CR: "Callier Richardson",
  CRA: "Callier Richardson Annex",
  ECSN: "Engineering & CS North",
  ECSS: "Engineering & CS South",
  ECSW: "Engineering & CS West",
  FN: "Founders North",
  FO: "Founders",
  GR: "Green Hall",
  HH: "Hoblitzelle Hall",
  JO: "Jonsson",
  JSOM: "Jindal School",
  MC: "McDermott Library",
  ML1: "Modular Lab 1",
  ML2: "Modular Lab 2",
  PHY: "Physics",
  ROC: "Research Operations",
  SCI: "Sciences",
  SLC: "Science Learning Center",
  SOM: "Jindal School",
  SP2: "Synergy Park North 2",
  SPN: "Synergy Park North",
  SSA: "Student Services",
  SSB: "Student Services",
  SU: "Student Union",
  TH: "Theatre",
  VCB: "Visitor Center",
};

const EXCLUDED_BUILDINGS = /^(|ONLINE|OTHER|OUTDOORS.*|COMETS LANDING.*)$/i;

export type Interval = { start: number; end: number; label: string | null };

export type RoomDay = {
  key: string;
  building: string;
  room: string;
  capacity: number | null;
  busy: Interval[];
};

export type RoomDayData = {
  date: string;
  rooms: RoomDay[];
  feeds: { feed: Feed; ok: boolean }[];
  fetchedAt: Date;
};

export const roomKey = (building: string, room: string) =>
  `${building.trim().toUpperCase()} ${room.trim().toUpperCase()}`;

/** Minutes past midnight from "4:00pm" or a local ISO "2026-09-24T08:30:00". */
function toMinute(value: unknown, date: string) {
  if (typeof value !== "string") return null;
  const iso = value.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/);
  if (iso) {
    if (iso[1] < date) return 0;
    if (iso[1] > date) return 24 * 60;
    return Number(iso[2]) * 60 + Number(iso[3]);
  }
  return parseClock(value);
}

const first = (event: Record<string, unknown>, keys: string[]) =>
  keys.map((key) => event[key]).find((value) => value != null);

/** Normalize one feed's day into busy intervals; drops malformed events. */
export function normalizeFeed(
  feed: Feed,
  date: string,
  buildings: NebulaDayBuildings,
) {
  const out: {
    key: string;
    building: string;
    room: string;
    interval: Interval;
    capacity: number | null;
  }[] = [];
  for (const building of buildings) {
    if (EXCLUDED_BUILDINGS.test(building.building.trim())) continue;
    for (const room of building.rooms ?? []) {
      for (const event of room.events ?? []) {
        const state = String(event.current_state ?? event.status ?? "");
        if (/cancel|denied|declined/i.test(state)) continue;
        const start = toMinute(
          first(event, ["start_time", "start_date", "startTime"]),
          date,
        );
        const end = toMinute(
          first(event, ["end_time", "end_date", "endTime"]),
          date,
        );
        if (start === null || end === null || end <= start) continue;
        const label =
          feed === "events"
            ? "Class"
            : String(
                first(event, ["activity_name", "event_name", "title"]) ??
                  "Reserved",
              );
        const capacity =
          typeof event.capacity === "number" && event.capacity > 0
            ? event.capacity
            : null;
        out.push({
          key: roomKey(building.building, room.room),
          building: building.building.trim().toUpperCase(),
          room: room.room.trim().toUpperCase(),
          interval: { start, end, label: label.slice(0, 80) },
          capacity,
        });
      }
    }
  }
  return out;
}

/** Sort and merge overlapping or touching intervals (half-open). */
export function mergeIntervals(intervals: Interval[]) {
  const sorted = [...intervals].sort(
    (a, b) => a.start - b.start || a.end - b.end,
  );
  const merged: Interval[] = [];
  for (const next of sorted) {
    const last = merged.at(-1);
    if (last && next.start <= last.end) {
      last.end = Math.max(last.end, next.end);
      if (last.label !== next.label) last.label = last.label ?? next.label;
    } else merged.push({ ...next });
  }
  return merged;
}

export type RoomQuery = {
  from: number;
  to: number;
  building?: string;
  minCapacity?: number;
};

export type RoomResult = {
  key: string;
  building: string;
  buildingName: string | null;
  room: string;
  capacity: number | null;
  freeFrom: number;
  freeUntil: number;
  busy: Interval[];
  nextBusy: Interval | null;
  /** The feeds booked this room today, so its schedule is actually known. */
  tracked: boolean;
};

/**
 * Rooms with no known class or reservation overlapping [from, to), with the
 * full free stretch around it. Rooms the feeds booked at some point that day
 * come first (their schedule is known); then the longest free stretch after
 * `to`, smaller known capacity (study-sized rooms first), and name.
 */
export function findFreeRooms(rooms: RoomDay[], query: RoomQuery) {
  if (query.to <= query.from) return [];
  const results: RoomResult[] = [];
  for (const room of rooms) {
    if (query.building && room.building !== query.building) continue;
    if (query.minCapacity && (room.capacity ?? 0) < query.minCapacity) continue;
    const busy = mergeIntervals(room.busy);
    if (busy.some((b) => b.start < query.to && b.end > query.from)) continue;
    const before = busy.filter((b) => b.end <= query.from).at(-1);
    const after = busy.find((b) => b.start >= query.to) ?? null;
    results.push({
      key: room.key,
      building: room.building,
      buildingName: BUILDING_NAMES[room.building] ?? null,
      room: room.room,
      capacity: room.capacity,
      freeFrom: Math.max(before?.end ?? OPEN_MINUTE, OPEN_MINUTE),
      freeUntil: Math.min(after?.start ?? CLOSE_MINUTE, CLOSE_MINUTE),
      busy,
      nextBusy: after,
      tracked: busy.length > 0,
    });
  }
  return results.sort(
    (a, b) =>
      Number(b.tracked) - Number(a.tracked) ||
      b.freeUntil - a.freeUntil ||
      (a.capacity ?? 999) - (b.capacity ?? 999) ||
      a.key.localeCompare(b.key),
  );
}

/* ---------- Fetching ---------- */

type Inventory = Map<
  string,
  { building: string; room: string; capacity: number | null }
>;
type RoomCache = {
  inventory?: { at: number; rooms: Inventory };
  days: Map<string, { at: number; data: Promise<RoomDayData> }>;
};
const shared = globalThis as typeof globalThis & { __cometRooms?: RoomCache };
const cache: RoomCache = (shared.__cometRooms ??= { days: new Map() });
const DAY_TTL = 10 * 60 * 1000;
const INVENTORY_TTL = 24 * 60 * 60 * 1000;

async function inventory(nebula: NebulaClient) {
  if (cache.inventory && Date.now() - cache.inventory.at < INVENTORY_TTL)
    return cache.inventory.rooms;
  const rooms: Inventory = new Map();
  for (const building of await nebula.rooms()) {
    if (EXCLUDED_BUILDINGS.test(building.building.trim())) continue;
    for (const room of building.rooms) {
      if (!room.room.trim()) continue;
      rooms.set(roomKey(building.building, room.room), {
        building: building.building.trim().toUpperCase(),
        room: room.room.trim().toUpperCase(),
        capacity: room.capacity && room.capacity > 0 ? room.capacity : null,
      });
    }
  }
  cache.inventory = { at: Date.now(), rooms };
  return rooms;
}

type FeedDay = { feed: Feed; ok: boolean; buildings: NebulaDayBuildings };

async function loadDay(
  nebula: NebulaClient,
  date: string,
): Promise<RoomDayData> {
  const [known, ...feeds] = (await Promise.all([
    inventory(nebula).catch((): Inventory => new Map()),
    ...FEEDS.map((feed) =>
      nebula
        .roomEvents(feed, date)
        .then((buildings): FeedDay => ({ feed, ok: true, buildings }))
        .catch((): FeedDay => ({ feed, ok: false, buildings: [] })),
    ),
  ])) as [Inventory, ...FeedDay[]];
  const rooms = new Map<string, RoomDay>();
  for (const [key, room] of known) rooms.set(key, { key, ...room, busy: [] });
  for (const { feed, buildings } of feeds)
    for (const item of normalizeFeed(feed, date, buildings)) {
      const room =
        rooms.get(item.key) ??
        rooms
          .set(item.key, {
            key: item.key,
            building: item.building,
            room: item.room,
            capacity: null,
            busy: [],
          })
          .get(item.key)!;
      room.capacity ??= item.capacity;
      room.busy.push(item.interval);
    }
  return {
    date,
    rooms: [...rooms.values()],
    feeds: feeds.map(({ feed, ok }) => ({ feed, ok })),
    fetchedAt: new Date(),
  };
}

/** One campus day of room occupancy, cached for ten minutes per instance. */
export function roomDay(nebula: NebulaClient, date: string) {
  const hit = cache.days.get(date);
  if (hit && Date.now() - hit.at < DAY_TTL) return hit.data;
  const data = loadDay(nebula, date);
  cache.days.set(date, { at: Date.now(), data });
  data.then(
    (day) => {
      // Don't keep a day where every feed failed.
      if (day.feeds.every((f) => !f.ok)) cache.days.delete(date);
    },
    () => cache.days.delete(date),
  );
  for (const key of [...cache.days.keys()].slice(
    0,
    Math.max(0, cache.days.size - 10),
  ))
    cache.days.delete(key);
  return data;
}

export function buildingsIn(rooms: RoomDay[]) {
  return [...new Set(rooms.map((room) => room.building))]
    .sort()
    .map((code) => ({ code, name: BUILDING_NAMES[code] ?? null }));
}
