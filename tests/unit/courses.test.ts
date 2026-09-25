import { describe, expect, it } from "vitest";
import {
  currentTerm,
  extractCourseCodes,
  normalizeCode,
  termLabel,
} from "../../lib/courses";

describe("course codes", () => {
  it("normalizes common spellings, including variable-credit numbers", () => {
    expect(normalizeCode("cs2336")).toBe("CS 2336");
    expect(normalizeCode(" math-2414 ")).toBe("MATH 2414");
    expect(normalizeCode("CS 4V98")).toBe("CS 4V98");
    expect(normalizeCode("computer science")).toBeNull();
    expect(normalizeCode("CS 23")).toBeNull();
  });

  it("maps dates to Nebula academic sessions", () => {
    expect(currentTerm(new Date("2026-09-24T12:00:00Z"))).toBe("26F");
    expect(currentTerm(new Date("2027-02-01T12:00:00Z"))).toBe("27S");
    expect(currentTerm(new Date("2027-06-15T12:00:00Z"))).toBe("27U");
    expect(termLabel("26F")).toBe("Fall 2026");
  });
});

describe("schedule import parsing", () => {
  it("reads an Orion 'My Class Schedule' list view", () => {
    const orion = `Fall 2026 | Undergraduate | The University of Texas at Dallas
CS 2336 - Computer Science II
Status Units Grading Grade
Enrolled 3.00 Graded
Class Nbr Section Component Days & Times Room Instructor Start/End Date
80049 002 Lecture MoWe 10:00AM - 11:15AM ECSS 2.410 Zafar Anjum 08/24/2026 - 12/09/2026
MATH 2414 - Integral Calculus
Class Nbr Section Component
81234 Section: 0W1 Lecture`;
    expect(extractCourseCodes(orion)).toEqual([
      { code: "FALL 2026", section: null },
      { code: "CS 2336", section: "002" },
      { code: "MATH 2414", section: "0W1" },
    ]);
  });

  it("reads Schedule Planner / CourseBook section codes", () => {
    expect(
      extractCourseCodes("cs2336.002, PHYS 2325-003 and ECS 2390 HN1; CS 4V98"),
    ).toEqual([
      { code: "CS 2336", section: "002" },
      { code: "PHYS 2325", section: "003" },
      { code: "ECS 2390", section: "HN1" },
      { code: "CS 4V98", section: null },
    ]);
  });

  it("does not mistake five-digit class numbers for sections", () => {
    expect(extractCourseCodes("CS 2336 80049")).toEqual([
      { code: "CS 2336", section: null },
    ]);
  });
});
