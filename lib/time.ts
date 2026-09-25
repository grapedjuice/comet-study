/** UT Dallas runs on Central time; every date shown or entered is campus time. */
export const CAMPUS_TZ = "America/Chicago";
export const TZ_LABEL = "Central time";

const parts = (date: Date, options: Intl.DateTimeFormatOptions) =>
  Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: CAMPUS_TZ,
      hourCycle: "h23",
      ...options,
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );

/** Minutes the campus clock is ahead of UTC at an instant (negative in Dallas). */
function offsetMinutes(at: Date) {
  const p = parts(at, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const asUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
    Number(p.second),
  );
  return Math.round((asUtc - at.getTime()) / 60000);
}

/**
 * Campus wall-clock date ("2026-09-24") and time ("18:30") → UTC instant.
 * Returns null for malformed input. Nonexistent spring-forward times resolve
 * an hour later, like a wall clock would.
 */
export function campusToUtc(date: string, time: string): Date | null {
  const d = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const t = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!d || !t) return null;
  const [y, mo, da, h, mi] = [d[1], d[2], d[3], t[1], t[2]].map(Number);
  if (mo < 1 || mo > 12 || da < 1 || da > 31 || h > 23 || mi > 59) return null;
  const guess = Date.UTC(y, mo - 1, da, h, mi);
  if (new Date(guess).getUTCDate() !== da) return null;
  let instant = guess - offsetMinutes(new Date(guess)) * 60000;
  instant = guess - offsetMinutes(new Date(instant)) * 60000;
  return new Date(instant);
}

/** Campus calendar date of an instant as "YYYY-MM-DD". */
export function campusDate(at: Date) {
  const p = parts(at, { year: "numeric", month: "2-digit", day: "2-digit" });
  return `${p.year}-${p.month}-${p.day}`;
}

/** Campus wall-clock time of an instant as "HH:MM" (24h). */
export function campusTime(at: Date) {
  const p = parts(at, { hour: "2-digit", minute: "2-digit" });
  return `${p.hour}:${p.minute}`;
}

/** Minutes past campus midnight. */
export function campusMinutes(at: Date) {
  const [h, m] = campusTime(at).split(":").map(Number);
  return h * 60 + m;
}

/** Monday = 0 … Sunday = 6, in campus time. */
export function campusWeekday(at: Date) {
  const day = parts(at, { weekday: "short" }).weekday as string;
  return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(day);
}

/** Add whole days to a "YYYY-MM-DD" date. */
export function addDays(date: string, days: number) {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return next.toISOString().slice(0, 10);
}

/** Monday of the campus week containing a "YYYY-MM-DD" date. */
export function weekStart(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  const weekday = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  return addDays(date, -weekday);
}

export function isDateString(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    campusToUtc(value, "12:00") !== null
  );
}

const fmt = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-US", { timeZone: CAMPUS_TZ, ...options });
const timeFmt = fmt({ hour: "numeric", minute: "2-digit" });
const dayFmt = fmt({ weekday: "short", month: "short", day: "numeric" });
const longDayFmt = fmt({ weekday: "long", month: "long", day: "numeric" });

/** "6:30 PM" → "6:30pm"; drops ":00". */
export function formatTime(at: Date) {
  return timeFmt
    .format(at)
    .replace(":00", "")
    .replace(/\s?([AP])M/, (_, x: string) => `${x.toLowerCase()}m`);
}

export function formatDay(at: Date) {
  return dayFmt.format(at);
}

export function formatLongDay(at: Date) {
  return longDayFmt.format(at);
}

/** "Thu, Sep 24 · 6:30–8pm" */
export function formatRange(start: Date, end: Date) {
  return `${formatDay(start)} · ${formatTimeRange(start, end)}`;
}

/** "6:30–8pm", or "11am–1pm" when the halves differ. */
export function formatTimeRange(start: Date, end: Date) {
  const a = formatTime(start);
  const b = formatTime(end);
  if (campusDate(start) !== campusDate(end))
    return `${a} – ${formatDay(end)} ${b}`;
  return `${a.slice(-2) === b.slice(-2) ? a.slice(0, -2) : a}–${b}`;
}

/** "in 3 days", "tomorrow", "today", "in 2 hours", "now". */
export function relativeDay(at: Date, now = new Date()) {
  const minutes = Math.round((at.getTime() - now.getTime()) / 60000);
  if (minutes <= 0 && minutes > -120) return "now";
  if (minutes > 0 && minutes < 60) return `in ${minutes} min`;
  const days = Math.round(
    (Date.parse(campusDate(at)) - Date.parse(campusDate(now))) / 86400000,
  );
  if (days === 0)
    return minutes > 0 ? `in ${Math.round(minutes / 60)} hr` : "earlier today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}

/** "18:30" → "6:30pm" for a bare wall-clock time. */
export function formatClock(minutes: number) {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const suffix = h < 12 ? "am" : "pm";
  const hour = h % 12 || 12;
  return m
    ? `${hour}:${String(m).padStart(2, "0")}${suffix}`
    : `${hour}${suffix}`;
}

/** "4:00pm" / "10:30AM" → minutes past midnight. */
export function parseClock(value: string) {
  const match = value
    .trim()
    .toLowerCase()
    .match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?$/);
  if (!match) return null;
  const hour = (Number(match[1]) % 12) + (match[3] === "p" ? 12 : 0);
  return hour * 60 + Number(match[2] ?? 0);
}

export function greeting(now = new Date()) {
  const hour = Math.floor(campusMinutes(now) / 60);
  return hour < 5
    ? "Up late"
    : hour < 12
      ? "Good morning"
      : hour < 17
        ? "Good afternoon"
        : "Good evening";
}
