import { describe, expect, it } from "vitest";
import {
  examsFromRoomSchedule,
  parseExamWindows,
  parseTestingCenterGroups,
  parseTestingCenterListings,
  testingCenterExams,
  type RoomScheduleDay,
} from "../../lib/campus-exams";
import { campusDate, formatTimeRange } from "../../lib/time";

describe("registrar exam windows", () => {
  it("reads the Final Exam Assignments list", () => {
    const html = `<main><h2 class="wp-block-heading">Fall 2026 Exam Dates:</h2>
      <ul class="wp-block-list">
      <li>Full term and second 8-week classes: December 11 &#8211; 16</li>
      <li>First 8-week classes: October 13 &#8211; 17</li>
      </ul><h2>Final Exam Assignments</h2>
      <p>Final exams are integral components: May 1 – 3 is not a window.</p></main>`;
    expect(parseExamWindows(html)).toEqual([
      {
        term: "26F",
        label: "Full term and second 8-week classes",
        startsOn: "2026-12-11",
        endsOn: "2026-12-16",
      },
      {
        term: "26F",
        label: "First 8-week classes",
        startsOn: "2026-10-13",
        endsOn: "2026-10-17",
      },
    ]);
  });

  it("handles ranges across months and skips what it can't read", () => {
    const html = `<h2>Summer 2027 Exam Dates:</h2><ul>
      <li>10-week classes: July 30 – Aug. 2</li>
      <li>5-week classes: sometime in June</li></ul>`;
    expect(parseExamWindows(html)).toEqual([
      {
        term: "27U",
        label: "10-week classes",
        startsOn: "2027-07-30",
        endsOn: "2027-08-02",
      },
    ]);
    expect(parseExamWindows("<p>No exam dates posted yet.</p>")).toEqual([]);
  });
});

// Room-schedule fixture shaped like Nebula's /astra feed (campus-local times).
const booking = (name: string, date: string, start: string, end: string) => ({
  activity_name: name,
  start_date: `${date}T${start}:00`,
  end_date: `${date}T${end}:00`,
  current_state: null,
});
function day(
  date: string,
  rooms: [string, string, ReturnType<typeof booking>[]][],
): RoomScheduleDay {
  const buildings = new Map<
    string,
    { room: string; events: Record<string, unknown>[] }[]
  >();
  for (const [building, room, events] of rooms)
    buildings.set(building, [
      ...(buildings.get(building) ?? []),
      { room, events },
    ]);
  return {
    date,
    buildings: [...buildings].map(([building, list]) => ({
      building,
      rooms: list,
    })),
  };
}

const windows = [
  {
    term: "26F",
    label: "Full term and second 8-week classes",
    startsOn: "2026-12-11",
    endsOn: "2026-12-16",
  },
  {
    term: "26F",
    label: "First 8-week classes",
    startsOn: "2026-10-13",
    endsOn: "2026-10-17",
  },
];
const known = new Set([
  "CS 3345",
  "SE 3345",
  "SYSM 6320",
  "BA 3105",
  "MATH 1325",
  "CHEM 1311",
  "CS 5330",
]);
const cs = "CS 3345/001 - DATA STRUCT & FOUNDATION ALGOR";
const se = "SE 3345/001 - DATA STRUCT & FOUNDATION ALGOR";
const sysm = "SYSM 6320/501 - SYSTEMS ENGINEERING";
const ba = "BA 3105/054 - BUSINESS COMMUNICATION";

const days = [
  day("2026-10-07", [
    ["SOM", "2.802", [booking(ba, "2026-10-07", "10:00", "11:45")]],
  ]),
  day("2026-10-08", [
    ["ECSS", "2.203", [booking(cs, "2026-10-08", "08:30", "09:45")]],
  ]),
  day("2026-10-10", [
    [
      "GR",
      "2.302",
      [booking("2268 CHEM 1311 Common Exam", "2026-10-10", "08:00", "12:00")],
    ],
    [
      "GR",
      "3.420",
      [booking("2268 CHEM 1311 Common Exam", "2026-10-10", "10:00", "12:00")],
    ],
    [
      "HH",
      "2.402",
      [
        booking("2268 CHEM 1311 Common Exam", "2026-10-10", "10:00", "12:00"),
        booking(
          "Teardown Window for 2268 CHEM 1311 Common Exam",
          "2026-10-10",
          "12:00",
          "12:15",
        ),
      ],
    ],
    [
      "SCI",
      "1.220",
      [booking("CHEM 1311 Exam Review", "2026-10-10", "13:00", "15:00")],
    ],
  ]),
  day("2026-10-12", [
    [
      "CB",
      "1.222",
      [booking("CS 5330.001 Exam 1", "2026-10-12", "14:30", "16:15")],
    ],
  ]),
  day("2026-10-14", [
    ["ECSS", "2.203", [booking(cs, "2026-10-14", "08:30", "09:45")]],
  ]),
  day("2026-10-15", [
    ["SOM", "2.112", [booking(ba, "2026-10-15", "13:00", "15:45")]],
  ]),
  day("2026-10-19", [
    ["ECSS", "2.203", [booking(cs, "2026-10-19", "08:30", "09:45")]],
  ]),
  day("2026-12-07", [
    ["SOM", "2.714", [booking(sysm, "2026-12-07", "19:00", "21:45")]],
  ]),
  day("2026-12-14", [
    [
      "ECSS",
      "2.203",
      [
        booking(cs, "2026-12-14", "09:00", "10:45"),
        booking(se, "2026-12-14", "09:00", "10:45"),
      ],
    ],
    ["SOM", "2.714", [booking(sysm, "2026-12-14", "19:00", "21:45")]],
  ]),
];

describe("exams on the room schedule", () => {
  const { exams, unsure } = examsFromRoomSchedule(days, windows, known);
  const summary = (list: typeof exams) =>
    list
      .map(
        (e) =>
          `${e.courseCode}${e.sectionNumber ? `.${e.sectionNumber}` : ""} ${e.label} ${campusDate(e.startsAt)} ${formatTimeRange(e.startsAt, e.endsAt)} @ ${e.location} [${e.source}/${e.kind}]`,
      )
      .sort();

  it("finds each section's registrar final in the end-of-term window", () => {
    expect(summary(exams.filter((e) => e.source === "registrar"))).toEqual([
      "CS 3345.001 Final exam 2026-12-14 9–10:45am @ ECSS 2.203 [registrar/final]",
      "SE 3345.001 Final exam 2026-12-14 9–10:45am @ ECSS 2.203 [registrar/final]",
    ]);
  });

  it("holds back finals that could be a class meeting", () => {
    // SYSM's final is at its weekly class time; BA's window overlaps other
    // classes. Both need the section's meeting dates to confirm.
    expect(summary(unsure)).toEqual([
      "BA 3105.054 Final exam 2026-10-15 1–3:45pm @ SOM 2.112 [registrar/final]",
      "SYSM 6320.501 Final exam 2026-12-14 7–9:45pm @ SOM 2.714 [registrar/final]",
    ]);
  });

  it("never treats a section that keeps meeting as having a final", () => {
    // CS 3345.001 meets during the 8-week window and after it.
    expect(
      [...exams, ...unsure].filter(
        (e) =>
          e.courseCode === "CS 3345" && campusDate(e.startsAt) < "2026-12-01",
      ),
    ).toEqual([]);
  });

  it("merges department-booked rooms into one exam and skips reviews", () => {
    expect(summary(exams.filter((e) => e.source === "department"))).toEqual([
      "CHEM 1311 Common Exam 2026-10-10 10am–12pm @ GR 2.302, GR 3.420, HH 2.402 [department/midterm]",
      "CS 5330.001 Exam 1 2026-10-12 2:30–4:15pm @ CB 1.222 [department/midterm]",
    ]);
  });

  it("keeps ids stable across syncs", () => {
    const again = examsFromRoomSchedule(days, windows, known);
    expect(again.exams.map((e) => e.id).sort()).toEqual(
      exams.map((e) => e.id).sort(),
    );
  });
});

describe("Testing Center exams", () => {
  const listings = [
    "CE/EE 3161.091/092 Soc Issues & Ethics in Engr (M&W Classes) - Final (12/11-12/15) - R. Mezenner",
    "CS 2337.003 Comp Sci II (Tu&Th 1pm Class) - Midterm (10/16) - J. Smith",
    "BMEN 4388.001/002 / MECH 4381.001 Sr Dsgn Project - Training Exam (11/13-11/21) - B. Antohe",
    "CRIM 3325.0W1 Victimology (Online Class) - Quiz 1 (10/8-10/10) Optional - J. Garcia",
    "ITSS.3300.001 IT for Biz (Fri 10am Class) - Final (12/3-12/4) - A. Bodeker",
    "PSCI 4319.001 Political Pol Amer (Tue/Thu 2:30pm Class) - Exam 3 (12/7/12/9) - C. Bram",
    "ENGR 2300.003/005 Linear Alg for Engr - Exam 1 (10/2-10/3) - R. Mezenner",
    // Instructor-approved sittings aren't the class's exam dates.
    "CS 2337.003 Comp Sci II (Tu&Th 1pm Class) - Midterm Early 10/15 (Require Professor Approval) - J. Smith",
    "BMEN 3302.001 - Final ARC 12/15 (Require Professor Approval) - B. Kim",
    "CS 3354.002 - Exam 2 Makeup/ARC 10/28 (Require Professor Approval) - B. Maweu",
  ].map((title, i) => ({ id: String(4000 + i), title }));
  const known = new Set([
    "CE 3161",
    "EE 3161",
    "CS 2337",
    "BMEN 4388",
    "MECH 4381",
    "CRIM 3325",
    "ITSS 3300",
    "PSCI 4319",
    "ENGR 2300",
    "BMEN 3302",
  ]);
  const exams = testingCenterExams(
    listings,
    new Date("2026-09-25T17:00:00Z"),
    known,
  );
  const summary = exams.map(
    (e) =>
      `${e.courseCode}.${e.sectionNumber} ${e.label} [${e.kind}] ${campusDate(e.startsAt)}..${campusDate(new Date(e.endsAt.getTime() - 1))}`,
  );

  it("reads courses, sections, label and date span from each title", () => {
    expect(summary).toEqual([
      "CE 3161.091 Final [final] 2026-12-11..2026-12-15",
      "CE 3161.092 Final [final] 2026-12-11..2026-12-15",
      "EE 3161.091 Final [final] 2026-12-11..2026-12-15",
      "EE 3161.092 Final [final] 2026-12-11..2026-12-15",
      "CS 2337.003 Midterm [midterm] 2026-10-16..2026-10-16",
      "BMEN 4388.001 Training Exam [midterm] 2026-11-13..2026-11-21",
      "BMEN 4388.002 Training Exam [midterm] 2026-11-13..2026-11-21",
      "MECH 4381.001 Training Exam [midterm] 2026-11-13..2026-11-21",
      "CRIM 3325.0W1 Quiz 1 (optional) [quiz] 2026-10-08..2026-10-10",
      "ITSS 3300.001 Final [final] 2026-12-03..2026-12-04",
      "PSCI 4319.001 Exam 3 [midterm] 2026-12-07..2026-12-09",
      "ENGR 2300.003 Exam 1 [midterm] 2026-10-02..2026-10-03",
      "ENGR 2300.005 Exam 1 [midterm] 2026-10-02..2026-10-03",
    ]);
  });

  it("marks them as whole-day spans with a booking link", () => {
    expect(exams[0]).toMatchObject({
      allDay: true,
      source: "testing-center",
      location: "UTD Testing Center",
      bookingUrl: "https://www.registerblast.com/utdallas/Exam/List",
      listingId: "4000",
    });
    // Starts at campus midnight, ends at midnight after the last day.
    expect(exams[0].startsAt.toISOString()).toBe("2026-12-11T06:00:00.000Z");
    expect(exams[0].endsAt.toISOString()).toBe("2026-12-16T06:00:00.000Z");
  });

  it("puts listings without a year in the nearest one", () => {
    const [spring] = testingCenterExams(
      [{ id: "1", title: "CS 2337.003 Comp Sci II - Final (1/12) - J. Smith" }],
      new Date("2026-12-20T17:00:00Z"),
      known,
    );
    expect(campusDate(spring.startsAt)).toBe("2027-01-12");
  });

  it("reads the exam list page and a group's options", () => {
    const page = `<script>var objects = [{"html":"<select id=\\"ExamGroup1\\">
      <option value=\\"5497\\">ALEKS MATH PLACEMENT TEST</option>
      <option value=\\"5001\\">School of Engineering and Computer Sciences (ECS)</option>
      <option value=\\"4999\\">Jindal School of Management (JSOM)</option>
      <option value=\\"5085\\">School of Economic, Political &amp; Policy Sciences (EPPS)</option>
      </select>"}];</script>`;
    expect(parseTestingCenterGroups(page).map((g) => g.id)).toEqual([
      "5001",
      "4999",
      "5085",
    ]);
    expect(
      parseTestingCenterListings([
        {
          html: '<select><option value="" disabled selected>Choose</option><option value="4329959">CE/EE 3161.091/092 Soc Issues &amp; Ethics - Final (12/11-12/15) - R. Mezenner</option></select>',
        },
        { html: "<li>date step</li>" },
      ]),
    ).toEqual([
      {
        id: "4329959",
        title:
          "CE/EE 3161.091/092 Soc Issues & Ethics - Final (12/11-12/15) - R. Mezenner",
      },
    ]);
  });
});
