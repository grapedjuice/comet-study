import { addDays, campusToUtc, campusWeekday } from "./time";

/**
 * Picking a time a study group can actually make. Pure and deterministic, the
 * way match scores are (lib/matching.ts): the same inputs always rank the same
 * windows, and every window carries the reasons behind its score so the
 * assistant can say why it chose one.
 */
export const PLAN_VERSION = "v1";

/** Campus hours a session may run between: 8am–11pm. */
export const PLAN_OPEN_HOUR = 8;
export const PLAN_CLOSE_HOUR = 23;

export type BusyBlock = { startsAt: Date; endsAt: Date };

export type MeetingWindow = {
  /** Campus date, "YYYY-MM-DD". */
  date: string;
  startsAt: Date;
  endsAt: Date;
  /** Members free for the whole window. */
  attendees: number;
  members: number;
  score: number;
  scoreVersion: string;
  reasons: string[];
};

export type PlanInput = {
  /** One set of free hour slots (day * 24 + hour, Monday = 0) per member. */
  memberSlots: Set<number>[];
  /** Sessions, classes and exams the window must not collide with. */
  busy?: BusyBlock[];
  durationMinutes: number;
  /** First campus date to consider, "YYYY-MM-DD". */
  from: string;
  /** How many campus days to look across, starting at `from`. */
  days: number;
  /** Fewest members a window has to suit; defaults to a simple majority. */
  quorum?: number;
  openHour?: number;
  closeHour?: number;
  now?: Date;
};

const clamp = (value: number) => Math.min(1, Math.max(0, value));

/**
 * What a window's score is made of, in points out of 100. Each part is scored
 * 0–1 and scaled by its weight.
 */
export const PLAN_PARTS = [
  { key: "attendance", label: "Members free", weight: 55 },
  { key: "soon", label: "How soon it is", weight: 20 },
  { key: "hour", label: "Time of day", weight: 15 },
  { key: "slack", label: "Room to run over", weight: 10 },
] as const;

/**
 * Campus hours students actually meet in. Late afternoon and evening score
 * highest (classes are done), midday is fine, early morning and late night are
 * the fallback.
 */
function hourFit(hour: number) {
  if (hour >= 16 && hour < 21) return 1;
  if (hour >= 10 && hour < 16) return 0.8;
  if (hour >= 21) return 0.45;
  return 0.35;
}

const overlaps = (a: BusyBlock, startsAt: Date, endsAt: Date) =>
  a.startsAt < endsAt && a.endsAt > startsAt;

/** Runs of consecutive hours in [openHour, closeHour) that `quorum` members share. */
function freeRuns(
  counts: Map<number, number>,
  weekday: number,
  quorum: number,
  openHour: number,
  closeHour: number,
) {
  const runs: { start: number; end: number }[] = [];
  let start: number | null = null;
  for (let hour = openHour; hour <= closeHour; hour++) {
    const free =
      hour < closeHour && (counts.get(weekday * 24 + hour) ?? 0) >= quorum;
    if (free && start === null) start = hour;
    else if (!free && start !== null) {
      runs.push({ start, end: hour });
      start = null;
    }
  }
  return runs;
}

/**
 * The best times a group could meet, soonest-and-fullest first. Windows start
 * on the hour, need every attendee free for their whole length, and never land
 * on something already on the calendar.
 */
export function rankMeetingWindows(input: PlanInput): MeetingWindow[] {
  const {
    memberSlots,
    busy = [],
    durationMinutes,
    from,
    days,
    openHour = PLAN_OPEN_HOUR,
    closeHour = PLAN_CLOSE_HOUR,
    now = new Date(),
  } = input;
  const members = memberSlots.length;
  if (!members || durationMinutes <= 0 || days <= 0) return [];

  const quorum = Math.max(
    1,
    Math.min(input.quorum ?? Math.ceil(members / 2), members),
  );
  const counts = new Map<number, number>();
  for (const slots of memberSlots)
    for (const slot of slots) counts.set(slot, (counts.get(slot) ?? 0) + 1);

  // A window has to sit inside whole free hours, so a 90-minute session needs
  // two of them; the last half hour is slack the group keeps anyway.
  const span = Math.ceil(durationMinutes / 60);
  const windows: MeetingWindow[] = [];

  for (let day = 0; day < days; day++) {
    const date = addDays(from, day);
    const noon = campusToUtc(date, "12:00");
    if (!noon) continue;
    const weekday = campusWeekday(noon);
    for (const run of freeRuns(counts, weekday, quorum, openHour, closeHour)) {
      for (let hour = run.start; hour + span <= run.end; hour++) {
        const startsAt = campusToUtc(
          date,
          `${String(hour).padStart(2, "0")}:00`,
        );
        if (!startsAt) continue;
        const endsAt = new Date(startsAt.getTime() + durationMinutes * 60000);
        if (startsAt.getTime() <= now.getTime()) continue;
        if (busy.some((block) => overlaps(block, startsAt, endsAt))) continue;

        let attendees = members;
        for (let h = hour; h < hour + span; h++)
          attendees = Math.min(attendees, counts.get(weekday * 24 + h) ?? 0);
        if (attendees < quorum) continue;

        const components = {
          attendance: attendees / members,
          soon: clamp(1 - day / Math.max(1, days - 1)),
          hour: hourFit(hour),
          // Free hours either side mean a late start or a long session still fits.
          slack: clamp((run.end - run.start - span) / 3),
        };
        const score = Math.round(
          100 *
            clamp(
              PLAN_PARTS.reduce(
                (sum, part) => sum + (part.weight / 100) * components[part.key],
                0,
              ),
            ),
        );

        const reasons: string[] = [
          attendees === members
            ? `All ${members} members free`
            : `${attendees} of ${members} members free`,
        ];
        if (day === 0) reasons.push("Today");
        else if (day === 1) reasons.push("Tomorrow");
        if (hour >= 16 && hour < 21) reasons.push("After classes");
        const slackHours = run.end - (hour + span);
        if (slackHours >= 2) reasons.push(`${slackHours} spare hours after it`);

        windows.push({
          date,
          startsAt,
          endsAt,
          attendees,
          members,
          score,
          scoreVersion: PLAN_VERSION,
          reasons,
        });
      }
    }
  }

  return windows.sort(
    (a, b) => b.score - a.score || a.startsAt.getTime() - b.startsAt.getTime(),
  );
}

/**
 * The best windows with no two on the same day, so options read as real
 * alternatives instead of the same evening shifted by an hour.
 */
export function spreadMeetingWindows(windows: MeetingWindow[], limit = 3) {
  const seen = new Set<string>();
  const out: MeetingWindow[] = [];
  for (const window of windows) {
    if (seen.has(window.date)) continue;
    seen.add(window.date);
    out.push(window);
    if (out.length >= limit) break;
  }
  return out;
}
