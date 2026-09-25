import { parseClock } from "./time";

/* ---------- Weekly class meetings ---------- */

export type ClassBlock = {
  courseCode: string;
  weekday: number; // Monday = 0
  start: number; // minutes past campus midnight
  end: number;
  where: string | null;
};

const DAYS: Record<string, number> = {
  mon: 0,
  tue: 1,
  wed: 2,
  thu: 3,
  fri: 4,
  sat: 5,
  sun: 6,
};

/**
 * Turn a stored section schedule ("Mon/Wed 10:00am–11:15am · CB 1.206; Fri
 * 1:00pm–1:50pm") into weekly blocks. Unparseable parts are skipped.
 */
export function parseSchedule(courseCode: string, schedule: string | null) {
  if (!schedule) return [];
  const blocks: ClassBlock[] = [];
  for (const part of schedule.split(";")) {
    const [when, where] = part.split("·").map((s) => s.trim());
    const match = when?.match(/^([A-Za-z/]+)\s+(\S+)\s*[–-]\s*(\S+)$/);
    if (!match) continue;
    const start = parseClock(match[2]);
    const end = parseClock(match[3]);
    if (start === null || end === null || end <= start) continue;
    for (const day of match[1].split("/")) {
      const weekday = DAYS[day.slice(0, 3).toLowerCase()];
      if (weekday !== undefined)
        blocks.push({ courseCode, weekday, start, end, where: where || null });
    }
  }
  return blocks;
}

/* ---------- iCalendar ---------- */

export type IcsEvent = {
  uid: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  location?: string | null;
  description?: string | null;
  sequence?: number;
  cancelled?: boolean;
  updatedAt?: Date;
};

const stamp = (date: Date) =>
  date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

/** RFC 5545 TEXT escaping. */
export function escapeIcs(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Fold lines at 75 octets as the spec requires. */
function fold(line: string) {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let current = "";
  for (const char of line) {
    const limit = out.length ? 74 : 75;
    if (Buffer.byteLength(current + char, "utf8") > limit) {
      out.push(current);
      current = char;
    } else current += char;
  }
  out.push(current);
  return out.join("\r\n ");
}

export function buildIcs(
  events: IcsEvent[],
  name = "Comet Study",
  now = new Date(),
) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Comet Study//Study sessions//EN",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${escapeIcs(name)}`,
    "METHOD:PUBLISH",
  ];
  for (const event of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.uid}`,
      `DTSTAMP:${stamp(event.updatedAt ?? now)}`,
      `DTSTART:${stamp(event.startsAt)}`,
      `DTEND:${stamp(event.endsAt)}`,
      `SEQUENCE:${event.sequence ?? 0}`,
      `SUMMARY:${escapeIcs(event.title)}`,
    );
    if (event.location) lines.push(`LOCATION:${escapeIcs(event.location)}`);
    if (event.description)
      lines.push(`DESCRIPTION:${escapeIcs(event.description)}`);
    if (event.cancelled) lines.push("STATUS:CANCELLED");
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** Prefilled Google Calendar link from public fields only. */
export function googleCalendarUrl(event: {
  title: string;
  startsAt: Date;
  endsAt: Date;
  location?: string | null;
}) {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${stamp(event.startsAt)}/${stamp(event.endsAt)}`,
  });
  if (event.location) params.set("location", event.location);
  return `https://calendar.google.com/calendar/render?${params}`;
}
