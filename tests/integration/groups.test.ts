import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabaseClient, runMigrations } from "../../lib/db";
import { loadDashboard } from "../../lib/dashboard";
import {
  answerRequest,
  createGroup,
  getGroup,
  inviteToGroup,
  joinGroup,
  leaveGroup,
  listCourseGroups,
  listMembers,
  removeMember,
  type GroupInput,
} from "../../lib/groups";
import { findMatches, saveProfile } from "../../lib/matching";
import { addResource, readResourceFile } from "../../lib/resources";
import {
  createExam,
  createSession,
  listMySessions,
  setExamStance,
  setRsvp,
} from "../../lib/sessions";

const url = process.env.DATABASE_URL;
if (!url || process.env.COMET_ISOLATED_TEST_DB !== "1") {
  throw new Error("Group integration tests require an isolated test database");
}
const db = createDatabaseClient(url);
const TERM = "26F";
const COURSE = "BIOL 2311";

let n = 0;
async function student(
  course: string | null = COURSE,
  name = "Fictional Student",
) {
  const result = await db.pool.query<{ id: string }>(
    "insert into users (email_normalized, name, email_verified_at, onboarding_completed_at) values ($1, $2, now(), now()) returning id",
    [`groups.${Date.now()}.${n++}@utdallas.edu`, name],
  );
  const id = result.rows[0].id;
  if (course)
    await db.pool.query(
      "insert into user_courses (user_id, course_code, term) values ($1, $2, $3)",
      [id, course, TERM],
    );
  return id;
}

const input = (overrides: Partial<GroupInput> = {}): GroupInput => ({
  courseCode: COURSE,
  name: "Cell biology crew",
  description: null,
  capacity: 4,
  joinPolicy: "open",
  modality: "in_person",
  styles: ["practice"],
  goals: ["exams"],
  cadence: null,
  ...overrides,
});

beforeAll(async () => {
  await runMigrations(db);
  await db.pool.query(
    `insert into catalog_courses (code, subject, number, title, nebula_id, catalog_year)
     values ($1, 'BIOL', '2311', 'Introduction to Modern Biology', 'fixture', '26') on conflict do nothing`,
    [COURSE],
  );
});
afterAll(() => db.close());

describe("study groups", () => {
  it("never overfills a group under concurrent joins", async () => {
    const owner = await student();
    const groupId = await createGroup(db, owner, TERM, input());
    const joiners = await Promise.all(
      Array.from({ length: 8 }, () => student()),
    );
    const results = await Promise.allSettled(
      joiners.map((id) => joinGroup(db, id, groupId)),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    const members = await listMembers(db, groupId);
    expect(members.filter((m) => m.status === "active")).toHaveLength(4);
  });

  it("requires the course and routes request-only groups through approval", async () => {
    const owner = await student();
    const groupId = await createGroup(
      db,
      owner,
      TERM,
      input({ joinPolicy: "request" }),
    );
    await expect(joinGroup(db, await student(null), groupId)).rejects.toThrow(
      /Add BIOL 2311/,
    );
    const asker = await student();
    expect(await joinGroup(db, asker, groupId)).toBe("pending");
    // A pending student can't see private content yet.
    await expect(createSession(db, asker, groupId, session())).rejects.toThrow(
      /Only members/,
    );
    const stranger = await student();
    await expect(
      answerRequest(db, stranger, groupId, asker, true),
    ).rejects.toThrow(/Only members/);
    await answerRequest(db, owner, groupId, asker, true);
    expect((await getGroup(db, asker, groupId))?.myStatus).toBe("active");
  });

  it("invites classmates, who accept by joining", async () => {
    const owner = await student();
    const groupId = await createGroup(
      db,
      owner,
      TERM,
      input({ joinPolicy: "request" }),
    );
    const friend = await student();
    await inviteToGroup(db, owner, groupId, friend);
    expect((await getGroup(db, friend, groupId))?.myStatus).toBe("invited");
    expect(await joinGroup(db, friend, groupId)).toBe("active"); // invite skips approval
    const hidden = await student();
    await saveProfile(db, hidden, {
      styles: [],
      goals: [],
      modality: "either",
      preferredSize: 5,
      availability: [],
      discoverable: false,
    });
    await expect(inviteToGroup(db, owner, groupId, hidden)).rejects.toThrow(
      /can’t be invited/,
    );
    await expect(
      inviteToGroup(db, owner, groupId, await student(null)),
    ).rejects.toThrow(/can’t be invited/);
  });

  it("hands the group on when its organizer leaves, and archives an empty one", async () => {
    const owner = await student();
    const groupId = await createGroup(db, owner, TERM, input());
    const member = await student();
    await joinGroup(db, member, groupId);
    await leaveGroup(db, owner, groupId);
    expect((await getGroup(db, member, groupId))?.myRole).toBe("owner");
    await leaveGroup(db, member, groupId);
    expect((await getGroup(db, member, groupId))?.status).toBe("archived");
    await expect(joinGroup(db, await student(), groupId)).rejects.toThrow(
      /isn’t open/,
    );
  });

  it("only lets the organizer remove members", async () => {
    const owner = await student();
    const groupId = await createGroup(db, owner, TERM, input());
    const a = await student();
    const b = await student();
    await joinGroup(db, a, groupId);
    await joinGroup(db, b, groupId);
    await expect(removeMember(db, a, groupId, b)).rejects.toThrow(/organizer/);
    await removeMember(db, owner, groupId, b);
    expect((await listMembers(db, groupId)).map((m) => m.id)).not.toContain(b);
  });
});

function session() {
  const start = new Date(Date.now() + 2 * 86400000);
  return {
    title: "Review",
    startsAt: start,
    endsAt: new Date(start.getTime() + 90 * 60000),
    location: "SCI 1.220",
    notes: null,
  };
}

describe("sessions, exams, library and the dashboard", () => {
  it("keeps group content to members and feeds the dashboard", async () => {
    const owner = await student(COURSE, "Owner Fixture");
    const member = await student(COURSE, "Member Fixture");
    const outsider = await student(COURSE, "Outsider Fixture");
    const groupId = await createGroup(db, owner, TERM, input());
    await joinGroup(db, member, groupId);

    const sessionId = await createSession(db, owner, groupId, session());
    await setRsvp(db, member, sessionId, "maybe");
    await expect(setRsvp(db, outsider, sessionId, "going")).rejects.toThrow(
      /Only members/,
    );
    const mine = await listMySessions(
      db,
      member,
      new Date(),
      new Date(Date.now() + 7 * 86400000),
    );
    expect(mine.map((s) => [s.id, s.myRsvp, s.going, s.maybe])).toEqual([
      [sessionId, "maybe", 1, 1],
    ]);
    expect(
      await listMySessions(
        db,
        outsider,
        new Date(),
        new Date(Date.now() + 7 * 86400000),
      ),
    ).toEqual([]);

    await createExam(db, member, groupId, {
      kind: "midterm",
      label: "Midterm 1",
      startsAt: new Date(Date.now() + 10 * 86400000),
      endsAt: null,
      location: null,
    });

    const resourceId = await addResource(db, member, groupId, {
      kind: "notes",
      title: "Cell notes",
      description: null,
      url: null,
      file: { name: "cells.txt", bytes: Buffer.from("mitochondria") },
    });
    await expect(
      addResource(db, owner, groupId, {
        kind: "notes",
        title: "Again",
        description: null,
        url: null,
        file: { name: "copy.txt", bytes: Buffer.from("mitochondria") },
      }),
    ).rejects.toThrow(/already in the library/);
    expect(
      (await readResourceFile(db, owner, resourceId))?.data.toString(),
    ).toBe("mitochondria");
    expect(await readResourceFile(db, outsider, resourceId)).toBeNull();

    const dash = await loadDashboard(db, owner, TERM);
    expect(dash.sessions.map((s) => s.id)).toEqual([sessionId]);
    expect(dash.exams[0]).toMatchObject({
      label: "Midterm 1",
      badge: "Reported",
      confirms: 1,
    });
    expect(dash.actions.some((a) => a.kind === "exam")).toBe(true);
    await setExamStance(db, owner, dash.exams[0].id, "confirm");
    const after = await loadDashboard(db, owner, TERM);
    expect(after.exams[0].badge).toBe("High confidence"); // 2 of 2 members
    expect(after.actions.some((a) => a.kind === "exam")).toBe(false);
    expect(after.resources.map((r) => r.title)).toEqual(["Cell notes"]);
    expect(after.courses[0].groups.map((g) => g.id)).toContain(groupId);

    const outsiderDash = await loadDashboard(db, outsider, TERM);
    expect(outsiderDash.resources).toEqual([]);
    expect(outsiderDash.actions.some((a) => a.kind === "find-groups")).toBe(
      true,
    );
  });

  it("matches groups and classmates by shared free time", async () => {
    const evenings = [17, 18, 19, 41, 42, 43];
    const seeker = await student(COURSE, "Seeker Fixture");
    const owner = await student(COURSE, "Evening Fixture");
    const morning = await student(COURSE, "Morning Fixture");
    const profile = (availability: number[]) => ({
      styles: ["practice"],
      goals: ["exams"],
      modality: "either" as const,
      preferredSize: 4,
      availability,
      discoverable: true,
    });
    await saveProfile(db, seeker, profile(evenings));
    await saveProfile(db, owner, profile(evenings));
    await saveProfile(db, morning, profile([8, 9, 10]));
    const groupId = await createGroup(
      db,
      owner,
      TERM,
      input({ name: "Evening crew" }),
    );
    const result = await findMatches(db, seeker, TERM, COURSE);
    const evening = result.groups.find((g) => g.id === groupId)!;
    expect(evening.reasons[0]).toMatch(/shared window/);
    const people = result.people.map((p) => p.id);
    expect(people.indexOf(owner)).toBeLessThan(people.indexOf(morning));
    expect(people).not.toContain(seeker);
    expect(
      (await listCourseGroups(db, seeker, TERM)).some((g) => g.id === groupId),
    ).toBe(true);
  });
});
