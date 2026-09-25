import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addUserCourses,
  countClassmates,
  findCatalogCourses,
  listUserCourses,
  MAX_COURSES,
  removeUserCourse,
  resolveCourseChoices,
  searchCatalog,
} from "../../lib/courses";
import { createDatabaseClient, runMigrations } from "../../lib/db";
import { completeOnboarding, updateName } from "../../lib/profile";

const url = process.env.DATABASE_URL;
if (!url || process.env.COMET_ISOLATED_TEST_DB !== "1") {
  throw new Error("Course integration tests require an isolated test database");
}
const db = createDatabaseClient(url);
const TERM = "26F";

// Catalog fixture rows (real public course codes, no network).
const catalog = [
  ["CS 2336", "CS", "2336", "Computer Science II"],
  ["CS 4V98", "CS", "4V98", "Undergraduate Internship"],
  ["MATH 2414", "MATH", "2414", "Integral Calculus"],
  ["PHYS 2325", "PHYS", "2325", "Mechanics"],
  ...Array.from({ length: 14 }, (_, i) => [
    `HIST ${3300 + i}`,
    "HIST",
    String(3300 + i),
    `History Topic ${i}`,
  ]),
];

async function user(email: string) {
  const result = await db.pool.query<{ id: string }>(
    "insert into users (email_normalized) values ($1) returning id",
    [email],
  );
  return result.rows[0].id;
}
const pick = (code: string, section: string | null = null) => ({
  code,
  source: "search" as const,
  section: section
    ? {
        id: `s-${section}`,
        number: section,
        schedule: null,
        instructor: null,
        mode: null,
      }
    : null,
});

beforeAll(async () => {
  await runMigrations(db);
  for (const [code, subject, number, title] of catalog)
    await db.pool.query(
      "insert into catalog_courses (code, subject, number, title, nebula_id, catalog_year) values ($1,$2,$3,$4,$5,'26') on conflict do nothing",
      [code, subject, number, title, `n-${code}`],
    );
});
afterAll(() => db.close());

describe("catalog search", () => {
  it("ranks exact codes first and matches titles", async () => {
    expect((await searchCatalog(db, "cs2336"))[0]).toMatchObject({
      code: "CS 2336",
    });
    expect((await searchCatalog(db, "calculus")).map((c) => c.code)).toEqual([
      "MATH 2414",
    ]);
    expect((await searchCatalog(db, "CS 4V")).map((c) => c.code)).toEqual([
      "CS 4V98",
    ]);
    expect(await searchCatalog(db, "x")).toEqual([]);
    expect(await searchCatalog(db, "100%_")).toEqual([]);
  });
});

describe("student courses", () => {
  it("stores courses, counts classmates and sectionmates, and removes", async () => {
    const alex = await user("alex.courses@utdallas.edu");
    const sam = await user("sam.courses@utdallas.edu");
    const riley = await user("riley.courses@utdallas.edu");
    await addUserCourses(db, alex, TERM, [
      pick("CS 2336", "002"),
      pick("MATH 2414"),
    ]);
    await addUserCourses(db, sam, TERM, [
      pick("CS 2336", "002"),
      pick("MATH 2414"),
    ]);
    await addUserCourses(db, riley, TERM, [pick("CS 2336", "003")]);

    const mine = await listUserCourses(db, alex, TERM);
    expect(mine.map((c) => [c.code, c.classmates, c.sectionmates])).toEqual([
      ["CS 2336", 2, 1],
      ["MATH 2414", 1, 0],
    ]);
    expect(await countClassmates(db, alex, TERM)).toBe(2);
    expect(await listUserCourses(db, alex, "27S")).toEqual([]);

    // Re-adding updates the section instead of duplicating.
    await addUserCourses(db, alex, TERM, [pick("CS 2336", "003")]);
    const updated = await listUserCourses(db, alex, TERM);
    expect(updated).toHaveLength(2);
    expect(updated[0]).toMatchObject({ sectionNumber: "003", sectionmates: 1 });

    expect(await removeUserCourse(db, sam, updated[0].id)).toBe(false);
    expect(await removeUserCourse(db, alex, updated[0].id)).toBe(true);
    expect(await listUserCourses(db, alex, TERM)).toHaveLength(1);
  });

  it(`caps a term at ${MAX_COURSES} courses`, async () => {
    const busy = await user("busy.courses@utdallas.edu");
    const hist = catalog.filter(([code]) => code.startsWith("HIST"));
    await addUserCourses(
      db,
      busy,
      TERM,
      hist.slice(0, MAX_COURSES).map(([code]) => pick(code)),
    );
    await expect(
      addUserCourses(db, busy, TERM, [pick(hist[MAX_COURSES][0])]),
    ).rejects.toThrow("TOO_MANY_COURSES");
  });

  it("validates codes against the catalog before adding", async () => {
    const { choices, unknown, sectionMissing } = await resolveCourseChoices(
      db,
      null,
      TERM,
      [
        { code: "cs2336", section: "002" },
        { code: "FALL 2026" },
        { code: "not a code" },
      ],
      "import",
    );
    expect(choices.map((c) => c.code)).toEqual(["CS 2336"]);
    expect(unknown).toEqual(["FALL 2026"]);
    // No live section lookup offline: kept without a section, and reported.
    expect(sectionMissing).toEqual(["CS 2336.002"]);
    expect((await findCatalogCourses(db, ["PHYS 2325"])).size).toBe(1);
  });
});

describe("onboarding", () => {
  it("requires a name and at least one course", async () => {
    const newbie = await user("newbie.courses@utdallas.edu");
    await expect(completeOnboarding(db, newbie, TERM)).rejects.toThrow(
      "NAME_REQUIRED",
    );
    await updateName(db, newbie, "Casey");
    await expect(completeOnboarding(db, newbie, TERM)).rejects.toThrow(
      "COURSES_REQUIRED",
    );
    await addUserCourses(db, newbie, TERM, [pick("PHYS 2325")]);
    await completeOnboarding(db, newbie, TERM);
    const row = await db.pool.query(
      "select onboarding_completed_at from users where id = $1",
      [newbie],
    );
    expect(row.rows[0].onboarding_completed_at).toBeInstanceOf(Date);
  });
});
