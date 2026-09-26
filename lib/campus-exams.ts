import { createHash } from "node:crypto";
import { currentTerm, ensureCatalog } from "./courses";
import { transaction, type createDatabaseClient } from "./db";
import type { NebulaClient, NebulaDayBuildings } from "./nebula";
import { addDays, campusDate, campusToUtc, isDateString } from "./time";

type Database = ReturnType<typeof createDatabaseClient>;

/**
 * Official exam dates, from three public sources (see docs/data-sources.md):
 * - the registrar's Final Exam Assignments page, for each term's final-exam
 *   periods;
 * - UT Dallas's room schedule (Ad Astra, served by Nebula's /astra feed),
 *   where the registrar books each section's final-exam slot and departments
 *   book rooms for midterms and common exams;
 * - the Testing Center's exam list (RegisterBlast), where instructors post
 *   exams students take there on a set of days, booking their own time.
 */
export const REGISTRAR_FINALS_URL =
  "https://registrar.utdallas.edu/final-exam-assignments/";

/** What students should know about each source, shown beside its dates. */
export const CAMPUS_EXAM_NOTE = {
  registrar:
    "Final-exam slot from the UT Dallas registrar. Rooms can change, so check Orion the week before finals.",
  department:
    "A department booked rooms for this exam on the UT Dallas room schedule. Your instructor has the final word.",
  "testing-center":
    "Taken at the UTD Testing Center on one of these days. Book a time on RegisterBlast at least 48 hours ahead.",
} as const;

/* ---------- Registrar final-exam windows ---------- */

export type ExamWindow = {
  term: string; // Nebula academic session, "26F"
  label: string; // "Full term and second 8-week classes"
  startsOn: string; // "2026-12-11"
  endsOn: string;
};

const SEASONS: Record<string, string> = { spring: "S", summer: "U", fall: "F" };
const MONTHS = "jan feb mar apr may jun jul aug sep oct nov dec".split(" ");
const ENTITIES: Record<string, string> = {
  amp: "&",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  rsquo: "’",
  quot: '"',
};

const decodeEntities = (text: string) =>
  text
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n: string) =>
      String.fromCodePoint(parseInt(n, 16)),
    )
    .replace(
      /&([a-z]+);/gi,
      (whole, name: string) => ENTITIES[name.toLowerCase()] ?? whole,
    );

/** Block-level HTML → trimmed text lines. */
function textLines(html: string) {
  return decodeEntities(
    html
      .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(
        /<\/?(?:h\d|li|p|div|ul|ol|br|tr|section|article)\b[^>]*>/gi,
        "\n",
      )
      .replace(/<[^>]+>/g, " "),
  )
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

const TERM_HEADING = /^(spring|summer|fall)\s+(\d{4})\s+exam dates:?$/i;
// "Full term and second 8-week classes: December 11 – 16"
const WINDOW_LINE =
  /^(.+?):\s*([a-z]{3,9})\.?\s+(\d{1,2})\s*(?:[–—-]|to)\s*(?:([a-z]{3,9})\.?\s+)?(\d{1,2})$/i;

function isoDate(year: number, month: string, day: string) {
  const index = MONTHS.indexOf(month.slice(0, 3).toLowerCase());
  if (index < 0) return null;
  const value = `${year}-${String(index + 1).padStart(2, "0")}-${day.padStart(2, "0")}`;
  return isDateString(value) ? value : null;
}

/**
 * Final-exam periods from the registrar's Final Exam Assignments page: a
 * "Fall 2026 Exam Dates:" heading followed by "<classes>: <Month> <d> – <d>"
 * lines. Anything that doesn't read cleanly is skipped, never guessed.
 */
export function parseExamWindows(html: string): ExamWindow[] {
  const windows: ExamWindow[] = [];
  let term: {
    code: string;
    year: number;
    found: number;
    skipped: number;
  } | null = null;
  for (const line of textLines(html)) {
    const heading = line.match(TERM_HEADING);
    if (heading) {
      term = {
        code: `${heading[2].slice(2)}${SEASONS[heading[1].toLowerCase()]}`,
        year: Number(heading[2]),
        found: 0,
        skipped: 0,
      };
      continue;
    }
    if (!term) continue;
    const match = line.match(WINDOW_LINE);
    if (!match) {
      // The list ended, or no list followed the heading.
      if (term.found || ++term.skipped > 3) term = null;
      continue;
    }
    const startsOn = isoDate(term.year, match[2], match[3]);
    let endsOn = isoDate(term.year, match[4] ?? match[2], match[5]);
    if (startsOn && endsOn && endsOn < startsOn)
      endsOn = match[4] ? isoDate(term.year + 1, match[4], match[5]) : null;
    if (!startsOn || !endsOn) continue;
    windows.push({ term: term.code, label: match[1].trim(), startsOn, endsOn });
    term.found++;
  }
  return windows;
}

/* ---------- Exams on the room schedule ---------- */

export type CampusExam = {
  id: string;
  term: string;
  courseCode: string;
  sectionNumber: string | null; // null: every section of the course
  kind: "final" | "midterm" | "quiz";
  label: string;
  startsAt: Date;
  endsAt: Date;
  location: string | null;
  allDay: boolean; // a span of whole days rather than a timed sitting
  openDates: string[] | null; // Testing Center days with open times
  bookingUrl: string | null;
  source: "registrar" | "department" | "testing-center";
  sourceName: string;
};

export type RoomScheduleDay = { date: string; buildings: NebulaDayBuildings };

type Booking = {
  name: string;
  date: string; // campus date, "2026-12-14"
  start: string; // campus time, "09:00"
  end: string;
  room: string;
};

// Class meetings and registrar final slots: "CS 3345/001 - DATA STRUCT …".
const CLASS_BOOKING = /^([A-Z]{2,4}) (\d[\dV]\d{2})\/([0-9A-Z]{3}) - /i;
// Department bookings: "2268 MATH 1325 Common Exam", "CS 5330.001 Exam 1".
const EXAM_WORD = /\b(?:exams?|midterms?|tests?|quiz(?:zes)?)\b/i;
const NOT_AN_EXAM = /\b(?:reviews?|setup|teardown|tutoring|prep)\b/i;
const COURSE_IN_NAME = /\b([A-Z]{2,4}) ?(\d[\dV]\d{2})(?:[./]([0-9A-Z]{3}))?\b/;
const LOCAL_TIME = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/;

function bookingsOf(day: RoomScheduleDay): Booking[] {
  const out: Booking[] = [];
  for (const building of day.buildings) {
    for (const room of building.rooms ?? []) {
      for (const event of room.events ?? []) {
        const state = String(event.current_state ?? "");
        if (/cancel|denied|declined/i.test(state)) continue;
        const start = String(event.start_date ?? "").match(LOCAL_TIME);
        const end = String(event.end_date ?? "").match(LOCAL_TIME);
        if (!start || !end || end[1] !== start[1] || end[2] <= start[2])
          continue;
        const where = building.building.trim().toUpperCase();
        out.push({
          name: String(event.activity_name ?? "").trim(),
          date: start[1],
          start: start[2],
          end: end[2],
          room: where === "ONLINE" ? "Online" : `${where} ${room.room.trim()}`,
        });
      }
    }
  }
  return out;
}

const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();
const slotKey = (b: Booking) => `${weekday(b.date)} ${b.start}-${b.end}`;

function describeRooms(rooms: Iterable<string>) {
  const list = [...new Set(rooms)].sort();
  if (list.length <= 3) return list.join(", ") || null;
  return `${list.slice(0, 2).join(", ")} +${list.length - 2} more rooms`;
}

/** "2268 MATH 1325 Common Exam" → "Common Exam"; bare "Tests" → "Test". */
function examLabel(name: string, course: RegExpMatchArray) {
  const at = course.index ?? 0;
  const rest = `${name.slice(0, at)} ${name.slice(at + course[0].length)}`
    .replace(/^\s*\d{4}\s+/, "") // PeopleSoft term number
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–—:|·,]+|[\s\-–—:|·,]+$/g, "");
  const bare = rest.match(/^(exam|test|midterm)s?$/i);
  if (!rest || bare)
    return bare
      ? bare[1][0].toUpperCase() + bare[1].slice(1).toLowerCase()
      : "Exam";
  return (rest[0].toUpperCase() + rest.slice(1)).slice(0, 60);
}

type ExamFields = Omit<
  CampusExam,
  "id" | "allDay" | "openDates" | "bookingUrl"
> &
  Partial<Pick<CampusExam, "allDay" | "openDates" | "bookingUrl">>;

function examId(exam: ExamFields) {
  return createHash("sha256")
    .update(
      [
        exam.term,
        exam.courseCode,
        exam.sectionNumber ?? "*",
        exam.kind,
        exam.source,
        exam.startsAt.toISOString(),
        exam.label,
      ].join("|"),
    )
    .digest("hex")
    .slice(0, 24);
}

function exam(fields: ExamFields): CampusExam | null {
  if (fields.endsAt <= fields.startsAt) return null;
  return {
    id: examId(fields),
    allDay: false,
    openDates: null,
    bookingUrl: null,
    ...fields,
  };
}

export type RoomScheduleExams = {
  exams: CampusExam[];
  /** Final slots that might be a class meeting instead; check section dates. */
  unsure: CampusExam[];
};

/**
 * Exams from consecutive days of the room schedule.
 *
 * Finals: during a registrar exam window, a section's booking is its final
 * slot (verified against CourseBook's "Exams" field). In the end-of-term
 * window classes are over, so a booking is a final unless it repeats the
 * section's weekly class time; earlier windows (8-week sessions) overlap
 * other classes, so those candidates always need confirming.
 *
 * Other exams: rooms a department booked under a course code and an exam
 * word ("Common Exam", "Midterm", "Test 2"), one entry across all its rooms.
 */
export function examsFromRoomSchedule(
  days: RoomScheduleDay[],
  windows: ExamWindow[],
  knownCodes: Set<string>,
): RoomScheduleExams {
  const sections = new Map<
    string,
    { code: string; section: string; bookings: Booking[] }
  >();
  const booked = new Map<
    string,
    (Booking & { code: string; section: string | null; label: string })[]
  >();
  for (const booking of days.flatMap(bookingsOf)) {
    const meeting = booking.name.match(CLASS_BOOKING);
    if (meeting) {
      const code = `${meeting[1].toUpperCase()} ${meeting[2].toUpperCase()}`;
      if (!knownCodes.has(code)) continue;
      const section = meeting[3].toUpperCase();
      const key = `${code}|${section}`;
      const entry = sections.get(key) ?? { code, section, bookings: [] };
      entry.bookings.push(booking);
      sections.set(key, entry);
      continue;
    }
    if (!EXAM_WORD.test(booking.name) || NOT_AN_EXAM.test(booking.name))
      continue;
    const course = booking.name.match(COURSE_IN_NAME);
    if (!course) continue;
    const code = `${course[1]} ${course[2]}`;
    if (!knownCodes.has(code)) continue;
    const section = course[3]?.toUpperCase() ?? null;
    const label = examLabel(booking.name, course);
    const key = `${code}|${section ?? "*"}|${booking.date}|${label}`;
    booked.set(key, [
      ...(booked.get(key) ?? []),
      { ...booking, code, section, label },
    ]);
  }

  const exams: CampusExam[] = [];
  const unsure: CampusExam[] = [];
  const termEnd = new Map<string, string>();
  for (const w of windows)
    if (w.endsOn > (termEnd.get(w.term) ?? "")) termEnd.set(w.term, w.endsOn);

  for (const { code, section, bookings } of sections.values()) {
    for (const window of windows) {
      const inWindow = bookings.filter(
        (b) => b.date >= window.startsOn && b.date <= window.endsOn,
      );
      // Still meeting after the window: these are classes, not a final.
      if (!inWindow.length || bookings.some((b) => b.date > window.endsOn))
        continue;
      const weekly = new Set(
        bookings.filter((b) => b.date < window.startsOn).map(slotKey),
      );
      const slots = new Map<string, Booking[]>();
      for (const b of inWindow) {
        const key = `${b.date} ${b.start}-${b.end}`;
        slots.set(key, [...(slots.get(key) ?? []), b]);
      }
      const endOfTerm = window.endsOn === termEnd.get(window.term);
      for (const group of slots.values()) {
        const [first] = group;
        const found = exam({
          term: window.term,
          courseCode: code,
          sectionNumber: section,
          kind: "final",
          label: "Final exam",
          startsAt: campusToUtc(first.date, first.start)!,
          endsAt: campusToUtc(first.date, first.end)!,
          location: describeRooms(group.map((b) => b.room)),
          source: "registrar",
          sourceName: first.name.slice(0, 120),
        });
        if (!found) continue;
        const sure =
          endOfTerm && slots.size === 1 && !weekly.has(slotKey(first));
        (sure ? exams : unsure).push(found);
      }
    }
  }

  for (const group of booked.values()) {
    // Rooms for one exam can be held for different spans (setup, overflow):
    // merge overlapping bookings and use the span most rooms share.
    const sorted = [...group].sort((a, b) => a.start.localeCompare(b.start));
    const clusters: (typeof sorted)[] = [];
    for (const b of sorted) {
      const last = clusters.at(-1);
      if (last && b.start < last.reduce((m, x) => (x.end > m ? x.end : m), ""))
        last.push(b);
      else clusters.push([b]);
    }
    for (const cluster of clusters) {
      const spans = new Map<string, number>();
      for (const b of cluster) {
        const span = `${b.start}-${b.end}`;
        spans.set(span, (spans.get(span) ?? 0) + 1);
      }
      const [start, end] = [...spans]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]
        .split("-");
      const [first] = cluster;
      const startsAt = campusToUtc(first.date, start)!;
      const found = exam({
        term: currentTerm(startsAt),
        courseCode: first.code,
        sectionNumber: first.section,
        kind: /final/i.test(first.label)
          ? "final"
          : /quiz/i.test(first.label)
            ? "quiz"
            : "midterm",
        label: first.label,
        startsAt,
        endsAt: campusToUtc(first.date, end)!,
        location: describeRooms(cluster.map((b) => b.room)),
        source: "department",
        sourceName: first.name.slice(0, 120),
      });
      if (found) exams.push(found);
    }
  }
  return { exams, unsure };
}

async function eachLimit<T>(
  items: T[],
  limit: number,
  work: (item: T) => Promise<void>,
) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await work(items[next++]);
    }),
  );
}

/**
 * Keep only candidate finals that fall after the section's last class
 * meeting, per Nebula's section dates. Unknown sections are dropped.
 */
export async function confirmFinals(
  db: Database,
  nebula: NebulaClient,
  candidates: CampusExam[],
  maxCourses = 80,
) {
  const codes = [...new Set(candidates.map((e) => e.courseCode))].slice(
    0,
    maxCourses,
  );
  if (!codes.length) return [];
  const courses = await db.pool.query<{ code: string; nebula_id: string }>(
    "select code, nebula_id from catalog_courses where code = any($1)",
    [codes],
  );
  const lastMeeting = new Map<string, string>();
  await eachLimit(courses.rows, 4, async (course) => {
    const sections = await nebula
      .courseSections(course.nebula_id)
      .catch(() => []);
    for (const section of sections) {
      const ends = (section.meetings ?? [])
        .map((m) => (m.end_date ? new Date(m.end_date) : null))
        .filter((d): d is Date => !!d && !Number.isNaN(d.getTime()))
        .map(campusDate)
        .sort();
      if (ends.length)
        lastMeeting.set(
          `${course.code}|${section.section_number.toUpperCase()}|${section.academic_session.name}`,
          ends.at(-1)!,
        );
    }
  });
  return candidates.filter((e) => {
    const last = lastMeeting.get(
      `${e.courseCode}|${e.sectionNumber}|${e.term}`,
    );
    return last !== undefined && campusDate(e.startsAt) > last;
  });
}

/* ---------- Testing Center (RegisterBlast) ---------- */

export const TESTING_CENTER_URL =
  "https://www.registerblast.com/utdallas/Exam/List";
const REGISTERBLAST = "https://www.registerblast.com/utdallas/Exam";

export type TestingCenterListing = { id: string; title: string };

const OPTION = /<option value="(\d+)"[^>]*>([\s\S]*?)<\/option>/g;

/** School groups on the exam list page (not placement or correspondence tests). */
export function parseTestingCenterGroups(html: string) {
  // The first step's markup sits inside a JSON string in a script.
  const markup = html.replaceAll('\\"', '"');
  return [...markup.matchAll(OPTION)]
    .map((m) => ({ id: m[1], name: decodeEntities(m[2]).trim() }))
    .filter((group) => /school|jindal/i.test(group.name));
}

/** Exam options from a group's steps (`/Exam/GroupChosen/{group}/1`). */
export function parseTestingCenterListings(
  steps: unknown,
): TestingCenterListing[] {
  if (!Array.isArray(steps)) return [];
  return steps.flatMap((step) =>
    [...String((step as { html?: unknown })?.html ?? "").matchAll(OPTION)].map(
      (m) => ({
        id: m[1],
        title: decodeEntities(m[2]).replace(/\s+/g, " ").trim(),
      }),
    ),
  );
}

// "CE/EE 3161.091/092", "BMEN 4388.001/002/003 / MECH 4381.001"
// Titles are typed by hand, so allow "ITSS.3300", "PSY 4v90", "(10/19-10-20)"
// and "(12/7/12/9)".
const LISTED_COURSES =
  /^((?:[A-Z]{2,4}\/)*[A-Z]{2,4})[ .](\d[\dVv]\d{2})(?:\.([0-9A-Z]{3}(?:\/[0-9A-Z]{3})*))?/;
const LISTED_DATES =
  /\((\d{1,2})\/(\d{1,2})(?:\s*[-–/]\s*(\d{1,2})[/-](\d{1,2}))?\)/;
// Accommodation, make-up and early sittings need an instructor's approval;
// they aren't the class's exam dates.
const SPECIAL_SITTING =
  /professor approval|\bARC\b|make-?up|\bearly\b|\btester\b|placement/i;

/** The month/day nearest an anchor date, since listings omit the year. */
function nearestDate(month: string, day: string, anchor: string) {
  const year = Number(anchor.slice(0, 4));
  const at = Date.parse(anchor);
  return [year - 1, year, year + 1]
    .map((y) => `${y}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`)
    .filter(isDateString)
    .sort(
      (a, b) => Math.abs(Date.parse(a) - at) - Math.abs(Date.parse(b) - at),
    )[0];
}

export type TestingCenterExam = CampusExam & { listingId: string };

/**
 * Exams from Testing Center listings, read from their titles:
 * "CE/EE 3161.091/092 Soc Issues & Ethics in Engr (M&W Classes) -
 * Final (12/11-12/15) - R. Mezenner" is a final for four course sections,
 * taken on a day from Dec 11 to 15.
 */
export function testingCenterExams(
  listings: TestingCenterListing[],
  now: Date,
  knownCodes: Set<string>,
): TestingCenterExam[] {
  const today = campusDate(now);
  const out = new Map<string, TestingCenterExam>();
  for (const { id, title } of listings) {
    if (SPECIAL_SITTING.test(title)) continue;
    const courses: { code: string; section: string | null }[] = [];
    let rest = title;
    for (let match; (match = rest.match(LISTED_COURSES)); ) {
      for (const subject of match[1].split("/"))
        for (const section of match[3]?.split("/") ?? [null])
          courses.push({
            code: `${subject} ${match[2].toUpperCase()}`,
            section,
          });
      rest = rest.slice(match[0].length);
      const more = rest.match(/^\s*\/\s*/);
      if (!more) break;
      rest = rest.slice(more[0].length);
    }
    const part = title
      .split(/\s+-\s+/)
      .slice(1)
      .find((p) => LISTED_DATES.test(p));
    const dates = part?.match(LISTED_DATES);
    if (!courses.length || !part || !dates) continue;
    const startsOn = nearestDate(dates[1], dates[2], today);
    const endsOn = dates[3]
      ? nearestDate(dates[3], dates[4], startsOn ?? today)
      : startsOn;
    if (!startsOn || !endsOn || endsOn < startsOn) continue;

    let label = part.replace(LISTED_DATES, "").replace(/\s+/g, " ").trim();
    if (/\boptional\b/i.test(label))
      label = `${label.replace(/\s*\boptional\b\s*/i, " ").trim()} (optional)`;
    label = (label || "Exam").slice(0, 60);
    const startsAt = campusToUtc(startsOn, "00:00")!;
    for (const { code, section } of courses) {
      if (!knownCodes.has(code)) continue;
      const found = exam({
        term: currentTerm(startsAt),
        courseCode: code,
        sectionNumber: section,
        kind: /final/i.test(label)
          ? "final"
          : /quiz/i.test(label)
            ? "quiz"
            : "midterm",
        label,
        startsAt,
        endsAt: campusToUtc(addDays(endsOn, 1), "00:00")!,
        location: "UTD Testing Center",
        allDay: true,
        bookingUrl: TESTING_CENTER_URL,
        source: "testing-center",
        sourceName: title.slice(0, 160),
      });
      if (found) out.set(found.id, { ...found, listingId: id });
    }
  }
  return [...out.values()];
}

const RB_HEADERS = {
  Accept: "application/json, text/html",
  "X-Requested-With": "XMLHttpRequest",
};

async function readTestingCenter(fetchImpl: typeof fetch) {
  const page = await fetchImpl(TESTING_CENTER_URL, {
    headers: { Accept: "text/html" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!page.ok) throw new Error("TESTING_CENTER_UNAVAILABLE");
  const groups = parseTestingCenterGroups(await page.text());
  if (!groups.length) throw new Error("TESTING_CENTER_UNAVAILABLE");
  const listings: TestingCenterListing[] = [];
  // Every group must load, or a partial list would delete real exams.
  for (const group of groups) {
    const response = await fetchImpl(
      `${REGISTERBLAST}/GroupChosen/${group.id}/1`,
      { headers: RB_HEADERS, signal: AbortSignal.timeout(15_000) },
    );
    if (!response.ok) throw new Error("TESTING_CENTER_UNAVAILABLE");
    listings.push(...parseTestingCenterListings(await response.json()));
  }
  return listings;
}

/** Days that still have open times for a listing, as "YYYY-MM-DD". */
async function fetchOpenDates(fetchImpl: typeof fetch, listingId: string) {
  const response = await fetchImpl(
    `${REGISTERBLAST}/GetDateStepDates/${listingId}`,
    { headers: RB_HEADERS, signal: AbortSignal.timeout(10_000) },
  );
  if (!response.ok) return null;
  const body: unknown = await response.json();
  if (!Array.isArray(body)) return null;
  return body
    .map((d) => String(d).match(/^(\d{2})-(\d{2})-(\d{4})$/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => `${m[3]}-${m[1]}-${m[2]}`)
    .filter(isDateString)
    .sort();
}

/* ---------- Sync ---------- */

type Client = Parameters<Parameters<typeof transaction>[1]>[0];

async function upsertExams(client: Client, rows: CampusExam[]) {
  for (let i = 0; i < rows.length; i += 300) {
    const values: unknown[] = [];
    const tuples = rows.slice(i, i + 300).map((e, j) => {
      values.push(
        e.id,
        e.term,
        e.courseCode,
        e.sectionNumber,
        e.kind,
        e.label,
        e.startsAt,
        e.endsAt,
        e.location,
        e.allDay,
        e.openDates,
        e.bookingUrl,
        e.source,
        e.sourceName,
      );
      const b = j * 14;
      return `(${Array.from({ length: 14 }, (_, k) => `$${b + k + 1}`).join(",")},now())`;
    });
    await client.query(
      `insert into campus_exams (id, term, course_code, section_number, kind, label,
                                 starts_at, ends_at, location, all_day, open_dates,
                                 booking_url, source, source_name, synced_at)
       values ${tuples.join(",")}
       on conflict (id) do update set location = excluded.location,
         ends_at = excluded.ends_at, open_dates = excluded.open_dates,
         source_name = excluded.source_name, synced_at = now()`,
      values,
    );
  }
}

/**
 * Replace the Testing Center exams that haven't ended with the current list.
 * Open days are looked up only for courses someone here takes.
 */
async function syncTestingCenter(
  db: Database,
  fetchImpl: typeof fetch,
  now: Date,
  knownCodes: Set<string>,
) {
  const exams = testingCenterExams(
    await readTestingCenter(fetchImpl),
    now,
    knownCodes,
  );
  const taken = new Set(
    (
      await db.pool.query<{ course_code: string }>(
        "select distinct course_code from user_courses",
      )
    ).rows.map((row) => row.course_code),
  );
  const lookups = [
    ...new Set(
      exams
        .filter((e) => taken.has(e.courseCode) && e.endsAt > now)
        .map((e) => e.listingId),
    ),
  ].slice(0, 120);
  const open = new Map<string, string[]>();
  await eachLimit(lookups, 3, async (id) => {
    const dates = await fetchOpenDates(fetchImpl, id).catch(() => null);
    if (dates?.length) open.set(id, dates);
  });
  const rows = exams.map(({ listingId, ...e }): CampusExam => {
    const first = campusDate(e.startsAt);
    const last = addDays(campusDate(e.endsAt), -1);
    const days = open.get(listingId)?.filter((d) => d >= first && d <= last);
    return { ...e, openDates: days?.length ? days : null };
  });
  await transaction(db, async (client) => {
    await client.query(
      "select pg_advisory_xact_lock(hashtext('campus_exam_sync'))",
    );
    await client.query(
      "delete from campus_exams where source = 'testing-center' and ends_at > $1",
      [now],
    );
    await upsertExams(client, rows);
  });
  return rows.length;
}

async function fetchRegistrarWindows(fetchImpl: typeof fetch) {
  const response = await fetchImpl(REGISTRAR_FINALS_URL, {
    headers: { Accept: "text/html" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) return [];
  return parseExamWindows(await response.text());
}

async function saveWindows(db: Database, windows: ExamWindow[]) {
  await transaction(db, async (client) => {
    await client.query("delete from exam_windows where term = any($1)", [
      [...new Set(windows.map((w) => w.term))],
    ]);
    for (const w of windows)
      await client.query(
        `insert into exam_windows (term, label, starts_on, ends_on, source_url)
         values ($1, $2, $3, $4, $5) on conflict (term, label) do nothing`,
        [w.term, w.label, w.startsOn, w.endsOn, REGISTRAR_FINALS_URL],
      );
  });
}

export type ExamSyncResult = {
  windows: number;
  days: number;
  failedDays: number;
  finals: number;
  departmentExams: number;
  testingCenterExams: number | null; // null: the Testing Center list failed
};

/**
 * Refresh exam windows and exam dates. The Testing Center list replaces its
 * upcoming exams when it loads in full. Each day the room schedule returned
 * replaces that day's room-schedule exams; days it couldn't serve (including
 * past days, which Nebula drops) keep their rows.
 */
export async function syncCampusExams(
  db: Database,
  nebula: NebulaClient,
  { now = new Date(), fetchImpl = fetch } = {},
): Promise<ExamSyncResult> {
  const today = campusDate(now);
  await ensureCatalog(db, nebula);
  const knownCodes = new Set(
    (
      await db.pool.query<{ code: string }>("select code from catalog_courses")
    ).rows.map((row) => row.code),
  );
  const testingCenterExams = await syncTestingCenter(
    db,
    fetchImpl,
    now,
    knownCodes,
  ).catch(() => null);

  const published = await fetchRegistrarWindows(fetchImpl).catch(
    (): ExamWindow[] => [],
  );
  if (published.length) await saveWindows(db, published);
  const windows = (
    await db.pool.query<ExamWindow>(
      `select term, label, starts_on::text as "startsOn", ends_on::text as "endsOn"
         from exam_windows where ends_on >= $1::date order by starts_on`,
      [today],
    )
  ).rows;

  // Through the last known exam window (plus a few days to see whether a
  // section keeps meeting), at least six weeks out, at most five months.
  const lastWindow = windows.reduce(
    (m, w) => (w.endsOn > m ? w.endsOn : m),
    "",
  );
  let horizon = lastWindow ? addDays(lastWindow, 3) : addDays(today, 120);
  if (horizon < addDays(today, 42)) horizon = addDays(today, 42);
  if (horizon > addDays(today, 150)) horizon = addDays(today, 150);
  const dates: string[] = [];
  for (let d = today; d <= horizon; d = addDays(d, 1)) dates.push(d);

  const days: RoomScheduleDay[] = [];
  let failedDays = 0;
  await eachLimit(dates, 4, async (date) => {
    try {
      const buildings = await nebula.roomEvents("astra", date);
      if (buildings.length) days.push({ date, buildings });
    } catch {
      failedDays++;
    }
  });
  if (!days.length) throw new Error("ROOM_SCHEDULE_UNAVAILABLE");
  days.sort((a, b) => a.date.localeCompare(b.date));

  const found = examsFromRoomSchedule(days, windows, knownCodes);
  const confirmed = await confirmFinals(db, nebula, found.unsure);
  const rows = [
    ...new Map(
      [...found.exams, ...confirmed].map((e) => [e.id, e] as const),
    ).values(),
  ];

  await transaction(db, async (client) => {
    await client.query(
      "select pg_advisory_xact_lock(hashtext('campus_exam_sync'))",
    );
    await client.query(
      `delete from campus_exams
        where source in ('registrar', 'department')
          and (starts_at at time zone 'America/Chicago')::date = any($1::date[])`,
      [days.map((d) => d.date)],
    );
    await upsertExams(client, rows);
  });
  return {
    windows: windows.length,
    days: days.length,
    failedDays,
    finals: rows.filter((e) => e.source === "registrar").length,
    departmentExams: rows.filter((e) => e.source === "department").length,
    testingCenterExams,
  };
}

/* ---------- Reads ---------- */

export type StoredCampusExam = CampusExam & { syncedAt: Date };

type Row = {
  id: string;
  term: string;
  course_code: string;
  section_number: string | null;
  kind: CampusExam["kind"];
  label: string;
  starts_at: Date;
  ends_at: Date;
  location: string | null;
  all_day: boolean;
  open_dates: string[] | null;
  booking_url: string | null;
  source: CampusExam["source"];
  source_name: string;
  synced_at: Date;
};

const SELECT = `
  select e.id, e.term, e.course_code, e.section_number, e.kind, e.label, e.starts_at,
         e.ends_at, e.location, e.all_day, e.open_dates, e.booking_url, e.source,
         e.source_name, e.synced_at
    from campus_exams e`;

const toExam = (row: Row): StoredCampusExam => ({
  id: row.id,
  term: row.term,
  courseCode: row.course_code,
  sectionNumber: row.section_number,
  kind: row.kind,
  label: row.label,
  startsAt: row.starts_at,
  endsAt: row.ends_at,
  location: row.location,
  allDay: row.all_day,
  openDates: row.open_dates,
  bookingUrl: row.booking_url,
  source: row.source,
  sourceName: row.source_name,
  syncedAt: row.synced_at,
});

/**
 * Exams for the student's courses overlapping [from, to): course-wide ones,
 * plus section ones when they told us their section.
 */
export async function listMyCampusExams(
  db: Database,
  userId: string,
  from: Date,
  to: Date,
) {
  const result = await db.pool.query<Row>(
    `${SELECT}
      join user_courses uc on uc.user_id = $1 and uc.course_code = e.course_code
                          and uc.term = e.term
     where e.ends_at > $2 and e.starts_at < $3
       and (e.section_number is null or upper(e.section_number) = upper(uc.section_number))
     order by e.starts_at, e.course_code limit 100`,
    [userId, from, to],
  );
  return result.rows.map(toExam);
}

/** A course's recent and upcoming exams, for one section or course-wide. */
export async function listCourseCampusExams(
  db: Database,
  courseCode: string,
  term: string,
  sectionNumber: string | null,
) {
  const result = await db.pool.query<Row>(
    `${SELECT}
     where e.course_code = $1 and e.term = $2 and e.ends_at > now() - interval '14 days'
       and (e.section_number is null or upper(e.section_number) = upper($3::text))
     order by e.starts_at limit 30`,
    [courseCode, term, sectionNumber],
  );
  return result.rows.map(toExam);
}

/** Sections of each course with an upcoming exam listed, for "pick your section" hints. */
export async function listSectionsWithExams(
  db: Database,
  term: string,
  codes: string[],
) {
  const result = await db.pool.query<{ code: string; sections: string[] }>(
    `select course_code as code, array_agg(distinct section_number order by section_number) as sections
       from campus_exams
      where term = $1 and course_code = any($2) and section_number is not null and ends_at > now()
      group by course_code`,
    [term, codes],
  );
  return new Map(result.rows.map((row) => [row.code, row.sections]));
}

export async function listExamWindows(db: Database, term: string) {
  const result = await db.pool.query<ExamWindow & { syncedAt: Date }>(
    `select term, label, starts_on::text as "startsOn", ends_on::text as "endsOn",
            synced_at as "syncedAt"
       from exam_windows where term = $1 order by starts_on`,
    [term],
  );
  return result.rows;
}
