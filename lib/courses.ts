import { after } from "next/server";
import type { createDatabaseClient } from "./db";
import type { NebulaClient, NebulaSection } from "./nebula";

type Database = ReturnType<typeof createDatabaseClient>;

export const MAX_COURSES = 12;
const CATALOG_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Nebula academic session for a date: Jan–May spring, Jun–Jul summer, Aug–Dec fall. */
export function currentTerm(now = new Date()) {
  const year = String(now.getUTCFullYear() % 100).padStart(2, "0");
  const month = now.getUTCMonth() + 1;
  return `${year}${month <= 5 ? "S" : month <= 7 ? "U" : "F"}`;
}

export function termLabel(term: string) {
  const season = { S: "Spring", U: "Summer", F: "Fall" }[term.slice(-1)];
  return `${season ?? term} 20${term.slice(0, 2)}`;
}

/**
 * "cs2336", "CS-2336", "cs 2336" → "CS 2336"; null if not a course code.
 * UTD variable-credit courses carry a V in the credit digit ("CS 4V98").
 */
export function normalizeCode(input: string) {
  const match = input
    .trim()
    .toUpperCase()
    .match(/^([A-Z]{2,4})\s*[-.]?\s*(\d[\dV]\d{2})$/);
  return match ? `${match[1]} ${match[2]}` : null;
}

const SECTION = String.raw`([0-9][0-9A-Z]{2}|[A-Z]{2}[0-9])`;
const CODE = new RegExp(
  String.raw`\b([A-Z]{2,4})[ \t]*-?[ \t]*(\d[\dV]\d{2})(?:[ \t]*[.-][ \t]*|[ \t]+)?${SECTION}?\b`,
  "g",
);
const SECTION_LABEL = new RegExp(String.raw`SECTION\s*[:#-]?\s*${SECTION}\b`);
// Orion tables list "Class Nbr" (5 digits) followed by the section column.
const CLASS_NBR_SECTION = new RegExp(String.raw`\b\d{5}\s+${SECTION}\b`);
// Orion's "View My Classes" names each component "<section> <component> -
// <class nbr>": "002 Lecture - 84582", "303 Laboratory - No Lab Fee - 84191".
const COMPONENT_SECTION = new RegExp(
  String.raw`(?:^|\s)${SECTION}\s+(LECTURE|LABORATORY|LAB|SEMINAR|DISCUSSION|RECITATION|STUDIO|PRACTICUM|INTERNSHIP|INDEPENDENT STUDY|RESEARCH|THESIS|DISSERTATION|CLINICAL|FIELD ?WORK|TUTORIAL)\b[^\n]*?-\s*\d{5}\b`,
  "g",
);

/** The lecture's section when a course lists several components. */
function componentSection(text: string) {
  const rows = [...text.matchAll(COMPONENT_SECTION)];
  return (rows.find((row) => row[2] === "LECTURE") ?? rows[0])?.[1] ?? null;
}

/**
 * Pull course codes (and sections when present) out of pasted schedule text:
 * Orion "My Class Schedule" or "View My Classes", Schedule Planner,
 * CourseBook or a transcript. Handles "CS 2336.002", "CS2336-002",
 * "CS 2336 - Computer Science II … Section 002" and "002 Lecture - 84582".
 * Candidates still need checking against the catalog.
 */
export function extractCourseCodes(text: string) {
  const upper = text.toUpperCase();
  const hits = [...upper.matchAll(CODE)];
  const found = new Map<string, string | null>();
  hits.forEach((hit, index) => {
    const code = `${hit[1]} ${hit[2]}`;
    let section: string | null = hit[3] ?? null;
    if (!section) {
      const end = (hit.index ?? 0) + hit[0].length;
      const next = hits[index + 1]?.index ?? upper.length;
      const tail = upper.slice(end, Math.min(next, end + 400));
      section =
        tail.match(SECTION_LABEL)?.[1] ??
        componentSection(tail) ??
        tail.match(CLASS_NBR_SECTION)?.[1] ??
        null;
    }
    if (!found.has(code) || (section && !found.get(code)))
      found.set(code, section);
  });
  return [...found].map(([code, section]) => ({ code, section }));
}

/* ---------- Catalog ---------- */

export async function catalogStatus(db: Database) {
  const result = await db.pool.query<{ count: string; synced: Date | null }>(
    "select count(*), max(synced_at) as synced from catalog_courses",
  );
  return {
    count: Number(result.rows[0].count),
    syncedAt: result.rows[0].synced,
  };
}

export async function syncCatalog(db: Database, nebula: NebulaClient) {
  const all = await nebula.allCourses();
  const newest = new Map<string, (typeof all)[number]>();
  for (const course of all) {
    const code = normalizeCode(
      `${course.subject_prefix} ${course.course_number}`,
    );
    if (!code) continue;
    const seen = newest.get(code);
    if (!seen || Number(course.catalog_year) > Number(seen.catalog_year))
      newest.set(code, course);
  }
  const rows = [...newest];
  const client = await db.pool.connect();
  try {
    await client.query("begin");
    await client.query(
      "select pg_advisory_xact_lock(hashtext('catalog_sync'))",
    );
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const values: unknown[] = [];
      const tuples = chunk.map(([code, course], j) => {
        values.push(
          code,
          course.subject_prefix.toUpperCase(),
          course.course_number,
          course.title,
          course.credit_hours ?? null,
          course._id,
          course.catalog_year,
        );
        const b = j * 7;
        return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},now())`;
      });
      await client.query(
        `insert into catalog_courses (code, subject, number, title, credit_hours, nebula_id, catalog_year, synced_at)
         values ${tuples.join(",")}
         on conflict (code) do update set subject = excluded.subject, number = excluded.number,
           title = excluded.title, credit_hours = excluded.credit_hours, nebula_id = excluded.nebula_id,
           catalog_year = excluded.catalog_year, synced_at = now()`,
        values,
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
  return rows.length;
}

let syncing: Promise<unknown> | null = null;

/** Sync on first use and weekly after; concurrent callers share one sync. */
export async function ensureCatalog(
  db: Database,
  nebula: NebulaClient | null,
  now = Date.now(),
) {
  const status = await catalogStatus(db);
  const stale =
    !status.syncedAt || now - status.syncedAt.getTime() > CATALOG_TTL_MS;
  if (!stale || !nebula) return status;
  syncing ??= syncCatalog(db, nebula).finally(() => {
    syncing = null;
  });
  if (status.count === 0) {
    await syncing; // Nothing to search yet: wait for the first sync.
    return catalogStatus(db);
  }
  // Refresh in the background. On serverless hosts the instance may freeze
  // once the response is sent, so hand the work to `after` when available.
  const refresh = syncing.catch(() => undefined);
  try {
    after(() => refresh);
  } catch {
    // Outside a request (scripts, tests): the promise simply runs on.
  }
  return status;
}

export type CatalogCourse = {
  code: string;
  title: string;
  creditHours: string | null;
};

export async function searchCatalog(db: Database, query: string, limit = 12) {
  const q = query
    .trim()
    .toUpperCase()
    .replace(/[%_\\]/g, "");
  if (q.length < 2) return [];
  const compact = q.replace(/[\s.-]+/g, "");
  const result = await db.pool.query<{
    code: string;
    title: string;
    credit_hours: string | null;
  }>(
    `select code, title, credit_hours from catalog_courses
      where replace(code, ' ', '') like $1 or title ilike $2
      order by (replace(code, ' ', '') = $3) desc,
               (replace(code, ' ', '') like $1) desc,
               (title ilike $4) desc,
               code
      limit $5`,
    [`${compact}%`, `%${q}%`, compact, `${q}%`, limit],
  );
  return result.rows.map<CatalogCourse>((row) => ({
    code: row.code,
    title: row.title,
    creditHours: row.credit_hours,
  }));
}

export async function findCatalogCourses(db: Database, codes: string[]) {
  if (!codes.length)
    return new Map<string, CatalogCourse & { nebulaId: string }>();
  const result = await db.pool.query<{
    code: string;
    title: string;
    credit_hours: string | null;
    nebula_id: string;
  }>(
    "select code, title, credit_hours, nebula_id from catalog_courses where code = any($1)",
    [codes],
  );
  return new Map(
    result.rows.map((row) => [
      row.code,
      {
        code: row.code,
        title: row.title,
        creditHours: row.credit_hours,
        nebulaId: row.nebula_id,
      },
    ]),
  );
}

/* ---------- Sections ---------- */

export type CourseSection = {
  id: string;
  number: string;
  schedule: string | null;
  instructor: string | null;
  mode: string | null;
};

const DAY = (day: string) => day.slice(0, 3);

function describeMeetings(section: NebulaSection) {
  const parts = (section.meetings ?? [])
    .filter((meeting) => meeting.meeting_days?.length || meeting.start_time)
    .map((meeting) => {
      const days = (meeting.meeting_days ?? []).map(DAY).join("/");
      const time =
        meeting.start_time && meeting.end_time
          ? `${meeting.start_time}–${meeting.end_time}`
          : (meeting.start_time ?? "");
      const where = [meeting.location?.building, meeting.location?.room]
        .filter(Boolean)
        .join(" ");
      return (
        [days, time].filter(Boolean).join(" ") + (where ? ` · ${where}` : "")
      );
    });
  return [...new Set(parts)].join("; ") || null;
}

const sectionCache = new Map<
  string,
  { at: number; sections: CourseSection[] }
>();

export async function termSections(
  nebula: NebulaClient,
  nebulaId: string,
  term: string,
) {
  const key = `${nebulaId}:${term}`;
  const cached = sectionCache.get(key);
  if (cached && Date.now() - cached.at < 30 * 60 * 1000) return cached.sections;
  const raw = (await nebula.courseSections(nebulaId)).filter(
    (section) => section.academic_session.name === term,
  );
  const sections = await Promise.all(
    raw
      .sort((a, b) => a.section_number.localeCompare(b.section_number))
      .map(async (section) => {
        const names = await Promise.all(
          (section.professors ?? [])
            .slice(0, 3)
            .map((id) => nebula.professorName(id)),
        );
        return {
          id: section._id,
          number: section.section_number,
          schedule: describeMeetings(section),
          instructor: names.filter(Boolean).join(", ") || null,
          mode: section.instruction_mode ?? null,
        };
      }),
  );
  sectionCache.set(key, { at: Date.now(), sections });
  return sections;
}

/* ---------- A student's courses ---------- */

export type UserCourse = {
  id: string;
  code: string;
  title: string;
  term: string;
  sectionNumber: string | null;
  schedule: string | null;
  instructor: string | null;
  classmates: number;
  sectionmates: number;
};

export async function listUserCourses(
  db: Database,
  userId: string,
  term: string,
) {
  const result = await db.pool.query<{
    id: string;
    course_code: string;
    title: string;
    term: string;
    section_number: string | null;
    schedule: string | null;
    instructor: string | null;
    classmates: string;
    sectionmates: string;
  }>(
    `select mine.id, mine.course_code, c.title, mine.term, mine.section_number,
            mine.schedule, mine.instructor,
            count(other.id) as classmates,
            count(other.id) filter (
              where mine.section_number is not null
                and other.section_number = mine.section_number
            ) as sectionmates
       from user_courses mine
       join catalog_courses c on c.code = mine.course_code
       left join user_courses other
              on other.course_code = mine.course_code
             and other.term = mine.term
             and other.user_id <> mine.user_id
      where mine.user_id = $1 and mine.term = $2
      group by mine.id, c.title
      order by mine.course_code`,
    [userId, term],
  );
  return result.rows.map<UserCourse>((row) => ({
    id: row.id,
    code: row.course_code,
    title: row.title,
    term: row.term,
    sectionNumber: row.section_number,
    schedule: row.schedule,
    instructor: row.instructor,
    classmates: Number(row.classmates),
    sectionmates: Number(row.sectionmates),
  }));
}

export type CourseChoice = {
  code: string;
  section: CourseSection | null;
  source: "search" | "import";
};

/** Upsert a student's courses for a term; re-adding a course updates its section. */
export async function addUserCourses(
  db: Database,
  userId: string,
  term: string,
  choices: CourseChoice[],
) {
  const client = await db.pool.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [
      `courses:${userId}`,
    ]);
    const existing = await client.query<{ course_code: string }>(
      "select course_code from user_courses where user_id = $1 and term = $2",
      [userId, term],
    );
    const have = new Set(existing.rows.map((row) => row.course_code));
    const adding = choices.filter((choice) => !have.has(choice.code)).length;
    if (have.size + adding > MAX_COURSES) throw new Error("TOO_MANY_COURSES");
    for (const choice of choices) {
      await client.query(
        `insert into user_courses (user_id, course_code, term, section_number, section_id, schedule, instructor, source)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         on conflict (user_id, course_code, term) do update set
           section_number = coalesce(excluded.section_number, user_courses.section_number),
           section_id = coalesce(excluded.section_id, user_courses.section_id),
           schedule = coalesce(excluded.schedule, user_courses.schedule),
           instructor = coalesce(excluded.instructor, user_courses.instructor)`,
        [
          userId,
          choice.code,
          term,
          choice.section?.number ?? null,
          choice.section?.id ?? null,
          choice.section?.schedule ?? null,
          choice.section?.instructor ?? null,
          choice.source,
        ],
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function removeUserCourse(
  db: Database,
  userId: string,
  id: string,
) {
  const result = await db.pool.query(
    "delete from user_courses where id = $1 and user_id = $2",
    [id, userId],
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Validate requested courses against the catalog and resolve sections for the
 * term. Unknown codes are reported, not added; a section that can't be found
 * (or can't be looked up) leaves the course added without one.
 */
export async function resolveCourseChoices(
  db: Database,
  nebula: NebulaClient | null,
  term: string,
  requested: { code: string; section?: string | null }[],
  source: CourseChoice["source"],
) {
  const wanted = new Map<string, string | null>();
  for (const item of requested) {
    const code = normalizeCode(item.code);
    if (code) wanted.set(code, item.section?.trim().toUpperCase() || null);
  }
  const catalog = await findCatalogCourses(db, [...wanted.keys()]);
  const choices: (CourseChoice & { title: string })[] = [];
  const unknown: string[] = [];
  const sectionMissing: string[] = [];
  for (const [code, sectionNumber] of wanted) {
    const course = catalog.get(code);
    if (!course) {
      unknown.push(code);
      continue;
    }
    let section: CourseSection | null = null;
    if (sectionNumber && nebula) {
      try {
        const sections = await termSections(nebula, course.nebulaId, term);
        section =
          sections.find((item) => item.number === sectionNumber) ?? null;
      } catch {
        section = null;
      }
    }
    if (sectionNumber && !section)
      sectionMissing.push(`${code}.${sectionNumber}`);
    choices.push({ code, section, source, title: course.title });
  }
  return { choices, unknown, sectionMissing };
}

/** Distinct other students who share at least one course with this student. */
export async function countClassmates(
  db: Database,
  userId: string,
  term: string,
) {
  const result = await db.pool.query<{ count: string }>(
    `select count(distinct other.user_id) from user_courses mine
       join user_courses other
         on other.course_code = mine.course_code
        and other.term = mine.term
        and other.user_id <> mine.user_id
      where mine.user_id = $1 and mine.term = $2`,
    [userId, term],
  );
  return Number(result.rows[0].count);
}
