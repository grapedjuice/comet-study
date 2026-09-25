import { describe, expect, it } from "vitest";
import {
  buildIcs,
  escapeIcs,
  googleCalendarUrl,
  parseSchedule,
} from "../../lib/calendar";
import {
  classSlots,
  groupSlots,
  jaccard,
  overlapWindows,
  scoreMatch,
  SCORE_VERSION,
} from "../../lib/matching";
import { safeFileName, sniffFile } from "../../lib/resources";
import {
  findFreeRooms,
  mergeIntervals,
  normalizeFeed,
  type RoomDay,
} from "../../lib/rooms";
import { examConfidence, validateSessionTimes } from "../../lib/sessions";
import {
  addDays,
  campusDate,
  campusMinutes,
  campusToUtc,
  campusWeekday,
  formatTimeRange,
  parseClock,
  weekStart,
} from "../../lib/time";

describe("campus time", () => {
  it("converts Central wall-clock times across daylight saving", () => {
    expect(campusToUtc("2026-09-24", "18:30")?.toISOString()).toBe(
      "2026-09-24T23:30:00.000Z",
    ); // CDT
    expect(campusToUtc("2026-12-01", "09:00")?.toISOString()).toBe(
      "2026-12-01T15:00:00.000Z",
    ); // CST
    expect(campusToUtc("2026-11-01", "01:30")).not.toBeNull(); // fall-back hour exists twice
    expect(campusToUtc("2026-02-30", "10:00")).toBeNull();
    expect(campusToUtc("2026-09-24", "25:00")).toBeNull();
  });

  it("reads instants back as campus dates, minutes and weekdays", () => {
    const at = new Date("2026-09-25T03:30:00Z"); // 10:30pm Thursday in Dallas
    expect(campusDate(at)).toBe("2026-09-24");
    expect(campusMinutes(at)).toBe(22 * 60 + 30);
    expect(campusWeekday(at)).toBe(3);
  });

  it("does calendar arithmetic on plain dates", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(weekStart("2026-09-27")).toBe("2026-09-21"); // Sunday → Monday before
    expect(weekStart("2026-09-21")).toBe("2026-09-21");
  });

  it("formats ranges compactly", () => {
    const start = campusToUtc("2026-09-25", "18:00")!;
    expect(formatTimeRange(start, campusToUtc("2026-09-25", "19:30")!)).toBe(
      "6–7:30pm",
    );
    expect(
      formatTimeRange(
        campusToUtc("2026-09-25", "11:00")!,
        campusToUtc("2026-09-25", "13:00")!,
      ),
    ).toBe("11am–1pm");
    expect(parseClock("4:00pm")).toBe(16 * 60);
    expect(parseClock("12:15am")).toBe(15);
    expect(parseClock("noon")).toBeNull();
  });
});

describe("class schedules", () => {
  it("parses stored section schedules into weekly blocks", () => {
    const blocks = parseSchedule(
      "CS 2336",
      "Mon/Wed 10:00am–11:15am · ECSW 1.355; Fri 1:00pm–1:50pm",
    );
    expect(blocks).toEqual([
      {
        courseCode: "CS 2336",
        weekday: 0,
        start: 600,
        end: 675,
        where: "ECSW 1.355",
      },
      {
        courseCode: "CS 2336",
        weekday: 2,
        start: 600,
        end: 675,
        where: "ECSW 1.355",
      },
      { courseCode: "CS 2336", weekday: 4, start: 780, end: 830, where: null },
    ]);
    expect(parseSchedule("X", "Online asynchronous")).toEqual([]);
    expect(parseSchedule("X", null)).toEqual([]);
  });

  it("marks every hour a class touches as busy", () => {
    const busy = classSlots([
      { code: "CS 2336", schedule: "Mon 10:00am–11:15am" },
    ]);
    expect([...busy].sort()).toEqual([10, 11]);
  });
});

describe("matching", () => {
  const evenings = new Set([17, 18, 19, 20, 24 + 17, 24 + 18]);
  it("finds runs of shared hours per day", () => {
    expect(overlapWindows(evenings, new Set([18, 19, 24 + 18]))).toEqual([
      { day: 0, start: 18, hours: 2 },
      { day: 1, start: 18, hours: 1 },
    ]);
  });

  it("keeps only hours a quorum shares", () => {
    const shared = groupSlots(
      [new Set([1, 2, 3]), new Set([2, 3]), new Set([3])],
      2,
    );
    expect([...shared].sort()).toEqual([2, 3]);
  });

  it("uses neutral similarity when nobody set preferences", () => {
    expect(jaccard([], [])).toBe(0.5);
    expect(jaccard(["a", "b"], ["b", "c"])).toBeCloseTo(1 / 3);
  });

  it("scores deterministically and explains without exposing schedules", () => {
    const seeker = {
      slots: evenings,
      styles: ["practice"],
      goals: ["exams"],
      modality: "in_person",
      preferredSize: 5,
    };
    const target = {
      slots: evenings,
      styles: ["practice"],
      goals: ["exams"],
      modality: "in_person",
      sameSection: true,
      capacity: 5,
      seatsLeft: 2,
    };
    const result = scoreMatch(seeker, target);
    expect(result.score).toBe(scoreMatch(seeker, target).score);
    expect(result.scoreVersion).toBe(SCORE_VERSION);
    expect(result.score).toBeGreaterThan(90);
    expect(result.reasons.join(" ")).not.toMatch(/\b(Mon|Tue|\d+(am|pm))\b/);
    expect(result.reasons).toContain("Same section");
    const worse = scoreMatch(seeker, {
      ...target,
      slots: new Set([100]),
      styles: ["quiet"],
      sameSection: false,
    });
    expect(worse.score).toBeLessThan(result.score);
    expect(worse.reasons).toContain("No shared free time yet");
  });
});

describe("rooms", () => {
  it("merges overlapping and touching intervals", () => {
    expect(
      mergeIntervals([
        { start: 600, end: 675, label: "Class" },
        { start: 675, end: 700, label: null },
        { start: 800, end: 900, label: "Club" },
        { start: 610, end: 620, label: "Class" },
      ]),
    ).toEqual([
      { start: 600, end: 700, label: "Class" },
      { start: 800, end: 900, label: "Club" },
    ]);
  });

  it("normalizes each feed and skips cancelled or malformed events", () => {
    const events = normalizeFeed("events", "2026-09-24", [
      {
        building: "ECSS",
        rooms: [
          {
            room: "2.410",
            events: [
              { start_time: "1:00pm", end_time: "2:15pm" },
              { start_time: "bad" },
            ],
          },
        ],
      },
      {
        building: "ONLINE",
        rooms: [
          { room: "x", events: [{ start_time: "1:00pm", end_time: "2:00pm" }] },
        ],
      },
    ]);
    expect(events).toHaveLength(1);
    expect(events[0].interval).toMatchObject({ start: 780, end: 855 });
    const astra = normalizeFeed("astra", "2026-09-24", [
      {
        building: "SOM",
        rooms: [
          {
            room: "1.110",
            events: [
              {
                activity_name: "Seminar",
                start_date: "2026-09-24T08:30:00",
                end_date: "2026-09-24T09:45:00",
                capacity: 79,
              },
              {
                activity_name: "Gone",
                start_date: "2026-09-24T12:00:00",
                end_date: "2026-09-24T13:00:00",
                current_state: "Cancelled",
              },
            ],
          },
        ],
      },
    ]);
    expect(astra).toHaveLength(1);
    expect(astra[0]).toMatchObject({
      key: "SOM 1.110",
      capacity: 79,
      interval: { start: 510, end: 585 },
    });
  });

  it("only returns rooms free for the whole half-open window", () => {
    const rooms: RoomDay[] = [
      {
        key: "A 1",
        building: "A",
        room: "1",
        capacity: 20,
        busy: [{ start: 600, end: 660, label: "Class" }],
      },
      {
        key: "A 2",
        building: "A",
        room: "2",
        capacity: 10,
        busy: [{ start: 630, end: 700, label: "Class" }],
      },
      { key: "B 1", building: "B", room: "1", capacity: null, busy: [] },
    ];
    const free = findFreeRooms(rooms, { from: 660, to: 720 });
    expect(free.map((r) => r.key)).toEqual(["A 1", "B 1"]); // 11:00 end doesn't block 11:00 start
    expect(free[0]).toMatchObject({ freeFrom: 660, tracked: true });
    expect(free[1].tracked).toBe(false); // no bookings on record ranks after known rooms
    expect(
      findFreeRooms(rooms, { from: 660, to: 720, minCapacity: 15 }).map(
        (r) => r.key,
      ),
    ).toEqual(["A 1"]);
    expect(findFreeRooms(rooms, { from: 700, to: 700 })).toEqual([]);
  });
});

describe("sessions and exams", () => {
  it("applies the exam confidence badges", () => {
    expect(examConfidence(0, 0, 5)).toBe("Unconfirmed");
    expect(examConfidence(1, 0, 1)).toBe("Reported"); // a solo report is never high confidence
    expect(examConfidence(2, 0, 6)).toBe("Likely");
    expect(examConfidence(2, 0, 3)).toBe("High confidence");
    expect(examConfidence(4, 0, 8)).toBe("High confidence");
    expect(examConfidence(5, 1, 8)).toBe("Conflicting reports");
  });

  it("validates session times", () => {
    const now = new Date("2026-09-24T12:00:00Z");
    const at = (h: number) => new Date(now.getTime() + h * 3600000);
    expect(() => validateSessionTimes(at(1), at(2), now)).not.toThrow();
    expect(() => validateSessionTimes(at(1), at(1.1), now)).toThrow(
      /15 minutes/,
    );
    expect(() => validateSessionTimes(at(-2), at(-1), now)).toThrow(/passed/);
    expect(() => validateSessionTimes(at(1), at(10), now)).toThrow(/8 hours/);
  });

  it("builds escaped, folded iCalendar files and public-only Google links", () => {
    expect(escapeIcs("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
    const ics = buildIcs([
      {
        uid: "session-1@x",
        title: "Review, ch. 4; " + "long ".repeat(30),
        startsAt: new Date("2026-09-25T23:00:00Z"),
        endsAt: new Date("2026-09-26T00:30:00Z"),
        location: "SCI 1.220",
        sequence: 2,
        cancelled: true,
      },
    ]);
    expect(ics).toContain("DTSTART:20260925T230000Z");
    expect(ics).toContain("SEQUENCE:2");
    expect(ics).toContain("STATUS:CANCELLED");
    expect(
      ics.split("\r\n").every((line) => Buffer.byteLength(line) <= 75),
    ).toBe(true);
    const url = new URL(
      googleCalendarUrl({
        title: "Review",
        startsAt: new Date("2026-09-25T23:00:00Z"),
        endsAt: new Date("2026-09-26T00:30:00Z"),
      }),
    );
    expect(url.searchParams.get("dates")).toBe(
      "20260925T230000Z/20260926T003000Z",
    );
  });
});

describe("library uploads", () => {
  it("trusts magic bytes, not names or claimed types", () => {
    expect(sniffFile("notes.pdf", Buffer.from("%PDF-1.7 ..."))?.mime).toBe(
      "application/pdf",
    );
    expect(sniffFile("notes.pdf", Buffer.from("MZ\x90\x00"))).toBeNull();
    expect(sniffFile("script.exe", Buffer.from("%PDF-1.7"))).toBeNull();
    expect(sniffFile("page.html", Buffer.from("<html>"))).toBeNull();
    expect(sniffFile("a.txt", Buffer.from("plain notes"))?.mime).toBe(
      "text/plain",
    );
    expect(sniffFile("a.txt", Buffer.from([0x61, 0x00, 0x62]))).toBeNull();
    expect(
      sniffFile("deck.pptx", Buffer.from([0x50, 0x4b, 0x03, 0x04, 1]))?.ext,
    ).toBe("pptx");
    expect(sniffFile("empty.pdf", Buffer.alloc(0))).toBeNull();
  });

  it("keeps file names readable and header-safe", () => {
    expect(safeFileName('../../etc/"passwd"\r\n.txt')).toBe(
      "..-..-etc-passwd.txt",
    );
    expect(safeFileName("Chapter 5 (review).pdf")).toBe(
      "Chapter 5 (review).pdf",
    );
    expect(safeFileName("<>")).toBe("file");
  });
});
