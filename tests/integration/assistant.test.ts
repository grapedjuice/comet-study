import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assistantOpeners,
  buildAssistantContext,
  runAssistantTool,
  type AssistantContext,
} from "../../lib/assistant";
import { createDatabaseClient, runMigrations } from "../../lib/db";
import { createGroup } from "../../lib/groups";
import { saveProfile } from "../../lib/matching";
import { addResource } from "../../lib/resources";
import { createExam, listGroupSessions } from "../../lib/sessions";
import { addDays, campusDate, campusToUtc } from "../../lib/time";

const url = process.env.DATABASE_URL;
if (!url || process.env.COMET_ISOLATED_TEST_DB !== "1") {
  throw new Error(
    "Assistant integration tests require an isolated test database",
  );
}
const db = createDatabaseClient(url);
const TERM = "26F";
const COURSE = "PHYS 2325";

// Mid-morning on a fixed day, so "today" never lands too late for a window.
const NOW = campusToUtc(campusDate(new Date()), "09:00")!;

let n = 0;
async function student(name = "Fictional Student") {
  const result = await db.pool.query<{ id: string }>(
    "insert into users (email_normalized, name, email_verified_at, onboarding_completed_at) values ($1, $2, now(), now()) returning id",
    [`assistant.${Date.now()}.${n++}@utdallas.edu`, name],
  );
  const id = result.rows[0].id;
  await db.pool.query(
    "insert into user_courses (user_id, course_code, term) values ($1, $2, $3)",
    [id, COURSE, TERM],
  );
  return id;
}

/** Free every evening, 5pm–10pm, every day of the week. */
const EVENINGS = Array.from({ length: 7 }, (_, day) =>
  [17, 18, 19, 20, 21].map((hour) => day * 24 + hour),
).flat();

async function available(userId: string, slots = EVENINGS) {
  await saveProfile(db, userId, {
    styles: ["practice"],
    goals: ["exams"],
    modality: "in_person",
    preferredSize: 4,
    availability: slots,
    discoverable: true,
  });
}

const context = (
  userId: string,
  groupId: string | null = null,
): AssistantContext => ({
  db,
  nebula: null,
  userId,
  term: TERM,
  termLabel: "Fall 2026",
  now: NOW,
  groupId,
});

beforeAll(async () => {
  await runMigrations(db);
  await db.pool.query(
    `insert into catalog_courses (code, subject, number, title, nebula_id, catalog_year)
     values ($1, 'PHYS', '2325', 'Mechanics', 'fixture', '26') on conflict do nothing`,
    [COURSE],
  );
});
afterAll(() => db.close());

async function crew(size = 3) {
  const owner = await student("Owner Student");
  await available(owner);
  const groupId = await createGroup(db, owner, TERM, {
    courseCode: COURSE,
    name: "Mechanics crew",
    description: null,
    capacity: 6,
    joinPolicy: "open",
    modality: "in_person",
    styles: ["practice"],
    goals: ["exams"],
    cadence: null,
  });
  for (let i = 1; i < size; i++) {
    const member = await student(`Member ${i}`);
    await available(member);
    await db.pool.query(
      "insert into group_members (group_id, user_id, role, status, joined_at) values ($1, $2, 'member', 'active', now())",
      [groupId, member],
    );
  }
  return { owner, groupId };
}

describe("assistant tools", () => {
  it("finds times every member is free and says who they suit", async () => {
    const { owner, groupId } = await crew(3);
    const result = await runAssistantTool(context(owner), "find_study_time", {
      groupId,
      durationMinutes: 90,
      withinDays: 7,
      notBefore: null,
    });
    expect(result.isError).toBeUndefined();
    expect(result.card.label).toMatch(/Found \d time/);
    expect(result.card.rows?.length).toBeGreaterThan(0);
    expect(result.content).toContain("3 of 3 free");
    // Every option must be inside the evening hours the members saved.
    for (const line of result.content
      .split("\n")
      .filter((l) => /^\d\./.test(l)))
      expect(line).toMatch(/\b([5-9]|10)(:\d\d)?[–-]/);
  });

  it("defaults to the group the chat was opened in", async () => {
    const { owner, groupId } = await crew(2);
    const result = await runAssistantTool(
      context(owner, groupId),
      "find_study_time",
      { groupId: null, durationMinutes: 60, withinDays: 7, notBefore: null },
    );
    expect(result.isError).toBeUndefined();
    expect(result.card.label).toMatch(/Found/);
  });

  it("schedules a session the whole group can see, then avoids that slot", async () => {
    const { owner, groupId } = await crew(2);
    const date = addDays(campusDate(NOW), 2);
    const booked = await runAssistantTool(context(owner), "schedule_session", {
      groupId,
      title: "Exam 2 review",
      date,
      start: "18:00",
      end: "19:30",
      location: "ECSS 2.410",
      notes: null,
    });
    expect(booked.isError).toBeUndefined();
    expect(booked.mutated).toBe(true);
    expect(booked.card.tone).toBe("good");

    const sessions = await listGroupSessions(db, owner, groupId);
    const made = sessions.find((s) => s.title === "Exam 2 review");
    expect(made).toBeDefined();
    expect(made!.location).toBe("ECSS 2.410");
    expect(made!.myRsvp).toBe("going");

    // The booked slot must not come back as a free option.
    const again = await runAssistantTool(context(owner), "find_study_time", {
      groupId,
      durationMinutes: 90,
      withinDays: 7,
      notBefore: date,
    });
    const clash = `${date}T18:00`;
    expect(again.content).not.toContain(clash);
    expect(
      again.card.rows?.some((row) => row.label.includes("6–7:30pm")),
    ).toBeFalsy();
  });

  it("refuses to act on a group the student isn't in", async () => {
    const { groupId } = await crew(2);
    const outsider = await student("Outsider");
    await available(outsider);
    for (const name of ["find_study_time", "group_details"] as const) {
      const result = await runAssistantTool(context(outsider), name, {
        groupId,
      });
      expect(result.isError).toBe(true);
      expect(result.content).toMatch(/Only members/);
    }
    const blocked = await runAssistantTool(
      context(outsider),
      "schedule_session",
      {
        groupId,
        title: "Sneaky session",
        date: addDays(campusDate(NOW), 2),
        start: "18:00",
        end: "19:00",
        location: null,
        notes: null,
      },
    );
    expect(blocked.isError).toBe(true);
    expect(await listGroupSessions(db, outsider, groupId)).toEqual([]);
  });

  it("reads a text file from the library, and only for members", async () => {
    const { owner, groupId } = await crew(2);
    const body =
      "Newton's second law: F = ma. Worked example 4.2 on page three.";
    const resourceId = await addResource(db, owner, groupId, {
      kind: "notes",
      title: "Chapter 4 notes",
      description: "From lecture",
      url: null,
      file: { name: "chapter-4.txt", bytes: Buffer.from(body, "utf8") },
    });

    const found = await runAssistantTool(context(owner), "search_library", {
      query: "Chapter 4",
      groupId,
      kind: null,
    });
    expect(found.content).toContain(resourceId);
    expect(found.card.rows?.[0].label).toBe("Chapter 4 notes");

    const opened = await runAssistantTool(context(owner), "open_resource", {
      resourceId,
    });
    expect(opened.content).toContain("F = ma");
    expect(opened.attachments).toBeUndefined();

    const outsider = await student("Outsider");
    const denied = await runAssistantTool(context(outsider), "open_resource", {
      resourceId,
    });
    expect(denied.card.tone).toBe("danger");
    expect(denied.content).not.toContain("F = ma");
  });

  it("says plainly when no member has saved any availability", async () => {
    const owner = await student("No availability");
    const groupId = await createGroup(db, owner, TERM, {
      courseCode: COURSE,
      name: "Blank crew",
      description: null,
      capacity: 4,
      joinPolicy: "open",
      modality: "in_person",
      styles: [],
      goals: [],
      cadence: null,
    });
    const result = await runAssistantTool(context(owner), "find_study_time", {
      groupId,
      durationMinutes: 90,
      withinDays: 7,
      notBefore: null,
    });
    expect(result.card.label).toBe("No free times saved");
    expect(result.content).toContain("/profile");
  });

  it("reports rooms as unavailable rather than guessing", async () => {
    const { owner } = await crew(2);
    const result = await runAssistantTool(context(owner), "find_rooms", {
      date: addDays(campusDate(NOW), 1),
      start: "18:00",
      end: "19:00",
      building: null,
      minCapacity: null,
    });
    expect(result.card.tone).toBe("danger");
    expect(result.content).toMatch(/isn't connected/);
  });

  it("builds a context naming the student's own group and library", async () => {
    const { owner, groupId } = await crew(2);
    await addResource(db, owner, groupId, {
      kind: "guide",
      title: "Midterm study guide",
      description: null,
      url: null,
      file: { name: "guide.md", bytes: Buffer.from("# Guide", "utf8") },
    });
    const text = await buildAssistantContext(context(owner, groupId));
    expect(text).toContain(groupId);
    expect(text).toContain("Mechanics crew");
    expect(text).toContain("Midterm study guide");
    expect(text).toContain(COURSE);
    expect(text).toContain("NOT connected");
  });

  it("carries both kinds of exam, out past the next three weeks", async () => {
    const { owner, groupId } = await crew(2);
    // The registrar's final, as a sync would have left it: course-wide, and
    // months out — the horizon that only the campus list reaches.
    const finals = addDays(campusDate(NOW), 90);
    await db.pool.query(
      `insert into campus_exams (id, term, course_code, section_number, kind, label,
                                 starts_at, ends_at, location, source, source_name)
       values ($1, $2, $3, null, 'final', 'Final exam', $4, $5, 'PHY 1.102', 'registrar', 'PHYS 2325 registrar listing')
       on conflict (id) do nothing`,
      [
        `fixture-final-${owner}`,
        TERM,
        COURSE,
        campusToUtc(finals, "09:00"),
        campusToUtc(finals, "10:45"),
      ],
    );
    // A midterm five weeks out: inside the exam horizon, past the session one.
    const far = addDays(campusDate(NOW), 35);
    await createExam(db, owner, groupId, {
      kind: "midterm",
      label: "Exam 3",
      startsAt: campusToUtc(far, "13:00")!,
      endsAt: campusToUtc(far, "14:15")!,
      location: "PHY 1.102",
    });
    let text: string;
    try {
      text = await buildAssistantContext(context(owner, groupId));
    } finally {
      // campus_exams is replaced wholesale on every sync, so the sync tests
      // count rows globally; never leave a fixture row behind for them.
      await db.pool.query("delete from campus_exams where id = $1", [
        `fixture-final-${owner}`,
      ]);
    }
    // Both lists are named, so the model never has to guess which it's quoting.
    expect(text).toContain("UT Dallas's own published schedule");
    expect(text).toContain("Exams their groupmates reported");
    // The registrar's final is months out; only the campus horizon reaches it.
    expect(text).toContain("PHYS 2325 registrar listing");
    expect(text).toContain("Exam 3");
    expect(text).toMatch(/Asked about a test, quiz, midterm or final/);
  });

  it("offers openers for what the student actually has", async () => {
    const { owner, groupId } = await crew(2);
    const before = await assistantOpeners(db, owner, TERM, groupId);
    expect(before).toContain(
      "Find a time we can all meet this week and book it",
    );
    expect(before).not.toContain("Quiz me from the notes in our library");

    await addResource(db, owner, groupId, {
      kind: "notes",
      title: "Week 5",
      description: null,
      url: null,
      file: { name: "w5.txt", bytes: Buffer.from("notes", "utf8") },
    });
    const after = await assistantOpeners(db, owner, TERM, groupId);
    expect(after).toContain("Quiz me from the notes in our library");

    const fresh = await student("No groups");
    expect(await assistantOpeners(db, fresh, TERM)).toContain(
      "Help me find a study group",
    );
  });
});
