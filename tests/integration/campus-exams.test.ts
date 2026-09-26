import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  listCourseCampusExams,
  listExamWindows,
  listMyCampusExams,
  syncCampusExams,
} from "../../lib/campus-exams";
import { createDatabaseClient, runMigrations } from "../../lib/db";
import type { NebulaClient, NebulaDayBuildings } from "../../lib/nebula";

const url = process.env.DATABASE_URL;
if (!url || process.env.COMET_ISOLATED_TEST_DB !== "1") {
  throw new Error("Exam integration tests require an isolated test database");
}
const db = createDatabaseClient(url);
const TERM = "26F";

const REGISTRAR = `<h2>Fall 2026 Exam Dates:</h2><ul>
  <li>Full term and second 8-week classes: December 11 &#8211; 16</li>
  <li>First 8-week classes: October 13 &#8211; 17</li></ul>`;
const registrarFetch = (async () =>
  new Response(REGISTRAR, { status: 200 })) as unknown as typeof fetch;

const booking = (name: string, date: string, start: string, end: string) => ({
  activity_name: name,
  start_date: `${date}T${start}:00`,
  end_date: `${date}T${end}:00`,
});
const room = (
  building: string,
  number: string,
  events: ReturnType<typeof booking>[],
): NebulaDayBuildings[number] => ({
  building,
  rooms: [{ room: number, events }],
});

const CS = "CS 3345/001 - DATA STRUCT & FOUNDATION ALGOR";
const SYSM = "SYSM 6320/501 - SYSTEMS ENGINEERING";

// Fake Nebula: a room schedule per day, and SYSM 6320.501's class dates.
function nebula(schedule: Record<string, NebulaDayBuildings | "down">) {
  return {
    async roomEvents(_feed: string, date: string) {
      const day = schedule[date];
      if (day === "down") throw new Error("NEBULA_UNAVAILABLE");
      return day ?? [];
    },
    async courseSections(id: string) {
      return id === "n-SYSM 6320"
        ? [
            {
              _id: "s-501",
              section_number: "501",
              academic_session: { name: TERM },
              meetings: [{ end_date: "2026-12-09T06:00:00Z" }],
            },
          ]
        : [];
    },
  } as unknown as NebulaClient;
}

async function student(email: string, courses: [string, string | null][]) {
  const { rows } = await db.pool.query<{ id: string }>(
    "insert into users (email_normalized) values ($1) returning id",
    [email],
  );
  for (const [code, section] of courses)
    await db.pool.query(
      "insert into user_courses (user_id, course_code, term, section_number) values ($1, $2, $3, $4)",
      [rows[0].id, code, TERM, section],
    );
  return rows[0].id;
}

const now = new Date("2026-12-01T18:00:00Z");
const from = new Date("2026-11-01T00:00:00Z");
const to = new Date("2027-01-31T00:00:00Z");
const describeExam = (e: {
  courseCode: string;
  sectionNumber: string | null;
  label: string;
  startsAt: Date;
  location: string | null;
}) =>
  `${e.courseCode}${e.sectionNumber ? `.${e.sectionNumber}` : ""} ${e.label} ${e.startsAt.toISOString()} ${e.location}`;

beforeAll(async () => {
  await runMigrations(db);
  for (const [code, subject, number] of [
    ["CS 3345", "CS", "3345"],
    ["SYSM 6320", "SYSM", "6320"],
    ["MATH 1325", "MATH", "1325"],
    ["EE 3161", "EE", "3161"],
    ["CE 3161", "CE", "3161"],
  ])
    await db.pool.query(
      "insert into catalog_courses (code, subject, number, title, nebula_id, catalog_year) values ($1,$2,$3,$4,$5,'26') on conflict do nothing",
      [code, subject, number, `${code} fixture`, `n-${code}`],
    );
});
afterAll(() => db.close());

describe("exam sync", () => {
  it("stores registrar finals and booked exams, matched to each student's section", async () => {
    const result = await syncCampusExams(
      db,
      nebula({
        "2026-12-05": [
          room("GR", "2.302", [
            booking(
              "2268 MATH 1325 Common Exam",
              "2026-12-05",
              "10:00",
              "12:00",
            ),
          ]),
        ],
        "2026-12-07": [
          room("SOM", "2.714", [booking(SYSM, "2026-12-07", "19:00", "21:45")]),
        ],
        "2026-12-14": [
          room("ECSS", "2.203", [booking(CS, "2026-12-14", "09:00", "10:45")]),
          room("SOM", "2.714", [booking(SYSM, "2026-12-14", "19:00", "21:45")]),
        ],
      }),
      { now, fetchImpl: registrarFetch },
    );
    expect(result).toMatchObject({ finals: 2, departmentExams: 1, days: 3 });
    expect(
      (await listExamWindows(db, TERM)).map((w) => [w.startsOn, w.endsOn]),
    ).toEqual([
      ["2026-10-13", "2026-10-17"],
      ["2026-12-11", "2026-12-16"],
    ]);

    const inSection = await student("exams.one@utdallas.edu", [
      ["CS 3345", "001"],
      ["SYSM 6320", "501"],
      ["MATH 1325", null],
    ]);
    expect(
      (await listMyCampusExams(db, inSection, from, to)).map(describeExam),
    ).toEqual([
      "MATH 1325 Common Exam 2026-12-05T16:00:00.000Z GR 2.302",
      "CS 3345.001 Final exam 2026-12-14T15:00:00.000Z ECSS 2.203",
      // At its weekly class time, confirmed by the section's last meeting.
      "SYSM 6320.501 Final exam 2026-12-15T01:00:00.000Z SOM 2.714",
    ]);

    // Another section, or no section, sees only course-wide exams.
    const otherSection = await student("exams.two@utdallas.edu", [
      ["CS 3345", "002"],
      ["MATH 1325", "004"],
    ]);
    expect(
      (await listMyCampusExams(db, otherSection, from, to)).map(
        (e) => e.courseCode,
      ),
    ).toEqual(["MATH 1325"]);
    expect(await listCourseCampusExams(db, "CS 3345", TERM, null)).toEqual([]);
    expect(
      (await listCourseCampusExams(db, "CS 3345", TERM, "001")).map(
        (e) => e.label,
      ),
    ).toEqual(["Final exam"]);
  });

  it("replaces each day it re-reads and keeps days it couldn't", async () => {
    await syncCampusExams(
      db,
      nebula({
        "2026-12-05": "down",
        "2026-12-14": [
          room("ECSS", "2.203", [booking(CS, "2026-12-14", "13:00", "15:45")]),
        ],
      }),
      { now, fetchImpl: registrarFetch },
    );
    const { rows } = await db.pool.query<{ id: string }>(
      "select id from users where email_normalized = 'exams.one@utdallas.edu'",
    );
    expect(
      (await listMyCampusExams(db, rows[0].id, from, to)).map(describeExam),
    ).toEqual([
      "MATH 1325 Common Exam 2026-12-05T16:00:00.000Z GR 2.302",
      "CS 3345.001 Final exam 2026-12-14T19:00:00.000Z ECSS 2.203",
    ]);
  });

  it("fails without touching stored exams when the room schedule is down", async () => {
    await expect(
      syncCampusExams(db, nebula({}), { now, fetchImpl: registrarFetch }),
    ).rejects.toThrow("ROOM_SCHEDULE_UNAVAILABLE");
    const { rows } = await db.pool.query<{ count: string }>(
      "select count(*) from campus_exams",
    );
    expect(Number(rows[0].count)).toBe(2);
  });
});

// Fake network for the Testing Center (RegisterBlast) and registrar pages.
function testingCenterFetch({ groupsDown = false } = {}) {
  return (async (input: string | URL) => {
    const url = String(input);
    if (url.startsWith("https://registrar.utdallas.edu"))
      return new Response(REGISTRAR);
    if (url.endsWith("/Exam/List"))
      return new Response(
        `<script>var objects=[{"html":"<option value=\\"5001\\">School of Engineering and Computer Sciences (ECS)</option>"}];</script>`,
      );
    if (url.endsWith("/GroupChosen/5001/1"))
      return groupsDown
        ? new Response("error", { status: 500 })
        : Response.json([
            {
              html: '<select><option value="4329959">CE/EE 3161.091/092 Soc Issues &amp; Ethics in Engr (M&amp;W Classes) - Final (12/11-12/15) - R. Mezenner</option><option value="4402908">CS 3345.001 Data Struc - Exam 2 Early 12/1 (Require Professor Approval) - A. Tester</option></select>',
            },
          ]);
    if (url.endsWith("/GetDateStepDates/4329959"))
      return Response.json([
        "12-11-2026",
        "12-12-2026",
        "12-14-2026",
        "12-15-2026",
      ]);
    return new Response("not found", { status: 404 });
  }) as unknown as typeof fetch;
}

describe("Testing Center sync", () => {
  it("stores Testing Center exams with their open days, apart from room-schedule days", async () => {
    const ethics = await student("exams.three@utdallas.edu", [
      ["EE 3161", "091"],
      ["CS 3345", "001"],
    ]);
    const result = await syncCampusExams(
      db,
      nebula({
        "2026-12-14": [
          room("ECSS", "2.203", [booking(CS, "2026-12-14", "09:00", "10:45")]),
        ],
      }),
      { now, fetchImpl: testingCenterFetch() },
    );
    // EE and CE, sections 091 and 092; the approval-only sitting is skipped.
    expect(result.testingCenterExams).toBe(4);
    const mine = await listMyCampusExams(db, ethics, from, to);
    expect(mine.map(describeExam)).toEqual([
      "EE 3161.091 Final 2026-12-11T06:00:00.000Z UTD Testing Center",
      "CS 3345.001 Final exam 2026-12-14T15:00:00.000Z ECSS 2.203",
    ]);
    expect(mine[0]).toMatchObject({
      allDay: true,
      source: "testing-center",
      openDates: ["2026-12-11", "2026-12-12", "2026-12-14", "2026-12-15"],
      endsAt: new Date("2026-12-16T06:00:00.000Z"),
    });
  });

  it("keeps Testing Center exams when its list only partly loads", async () => {
    const result = await syncCampusExams(
      db,
      nebula({
        "2026-12-14": [
          room("ECSS", "2.203", [booking(CS, "2026-12-14", "09:00", "10:45")]),
        ],
      }),
      { now, fetchImpl: testingCenterFetch({ groupsDown: true }) },
    );
    expect(result.testingCenterExams).toBeNull();
    const { rows } = await db.pool.query<{ count: string }>(
      "select count(*) from campus_exams where source = 'testing-center'",
    );
    expect(Number(rows[0].count)).toBe(4);
  });
});
