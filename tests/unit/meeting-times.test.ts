import { describe, expect, it } from "vitest";
import {
  PLAN_PARTS,
  rankMeetingWindows,
  spreadMeetingWindows,
} from "../../lib/meeting-times";
import { campusDate, campusToUtc, campusWeekday } from "../../lib/time";

// A Thursday in the fall term, well clear of a daylight-saving boundary.
const THU = "2026-10-08";
const FRI = "2026-10-09";
const beforeAll = campusToUtc(THU, "00:30")!;

/** Free hour slots for a campus date, as the profile grid stores them. */
const slotsOn = (date: string, hours: number[]) => {
  const weekday = campusWeekday(campusToUtc(date, "12:00")!);
  return new Set(hours.map((hour) => weekday * 24 + hour));
};

const base = {
  durationMinutes: 90,
  from: THU,
  days: 2,
  now: beforeAll,
};

describe("rankMeetingWindows", () => {
  it("finds a window every member shares", () => {
    const windows = rankMeetingWindows({
      ...base,
      memberSlots: [
        slotsOn(THU, [17, 18, 19]),
        slotsOn(THU, [18, 19, 20]),
        slotsOn(THU, [18, 19]),
      ],
    });
    expect(windows.length).toBeGreaterThan(0);
    const best = windows[0];
    expect(best.attendees).toBe(3);
    expect(best.members).toBe(3);
    expect(campusDate(best.startsAt)).toBe(THU);
    expect(best.endsAt.getTime() - best.startsAt.getTime()).toBe(90 * 60_000);
    expect(best.reasons[0]).toBe("All 3 members free");
  });

  it("ranks a window that suits everyone above one that suits fewer", () => {
    const windows = rankMeetingWindows({
      ...base,
      // Everyone shares Thursday 6–8pm; only one is free Thursday 10am–noon.
      memberSlots: [
        slotsOn(THU, [10, 11, 18, 19]),
        slotsOn(THU, [18, 19]),
        slotsOn(THU, [18, 19]),
      ],
      quorum: 1,
    });
    expect(windows[0].attendees).toBe(3);
    expect(windows[0].score).toBeGreaterThan(windows.at(-1)!.score);
  });

  it("never schedules over something already on the calendar", () => {
    const memberSlots = [slotsOn(THU, [18, 19]), slotsOn(THU, [18, 19])];
    const free = rankMeetingWindows({ ...base, memberSlots });
    expect(free.length).toBe(1);

    const blocked = rankMeetingWindows({
      ...base,
      memberSlots,
      busy: [
        {
          startsAt: campusToUtc(THU, "18:30")!,
          endsAt: campusToUtc(THU, "19:00")!,
        },
      ],
    });
    expect(blocked).toEqual([]);
  });

  it("skips windows that have already started", () => {
    const memberSlots = [
      slotsOn(THU, [9, 10, 18, 19]),
      slotsOn(THU, [9, 10, 18, 19]),
    ];
    const windows = rankMeetingWindows({
      ...base,
      memberSlots,
      now: campusToUtc(THU, "12:00")!,
    });
    expect(windows.length).toBeGreaterThan(0);
    expect(windows.every((w) => w.startsAt > campusToUtc(THU, "12:00")!)).toBe(
      true,
    );
  });

  it("needs the whole window free, not just its first hour", () => {
    // Two members overlap at 6pm only; a 90-minute session needs 6–8pm.
    const windows = rankMeetingWindows({
      ...base,
      memberSlots: [slotsOn(THU, [18]), slotsOn(THU, [18, 19])],
      quorum: 2,
    });
    expect(windows).toEqual([]);
  });

  it("honours the quorum and reports who is actually free", () => {
    const windows = rankMeetingWindows({
      ...base,
      memberSlots: [
        slotsOn(THU, [18, 19]),
        slotsOn(THU, [18, 19]),
        slotsOn(THU, [9, 10]),
      ],
      quorum: 2,
    });
    const thursdayEvening = windows.find(
      (w) => campusDate(w.startsAt) === THU && w.startsAt.getTime() > 0,
    )!;
    expect(thursdayEvening.attendees).toBe(2);
    expect(thursdayEvening.members).toBe(3);
    expect(thursdayEvening.reasons[0]).toBe("2 of 3 members free");
  });

  it("is deterministic", () => {
    const input = {
      ...base,
      memberSlots: [slotsOn(THU, [16, 17, 18, 19]), slotsOn(THU, [17, 18, 19])],
    };
    expect(rankMeetingWindows(input)).toEqual(rankMeetingWindows(input));
  });

  it("returns nothing when no one has saved availability", () => {
    expect(rankMeetingWindows({ ...base, memberSlots: [] })).toEqual([]);
    expect(
      rankMeetingWindows({ ...base, memberSlots: [new Set(), new Set()] }),
    ).toEqual([]);
  });

  it("scores out of 100 with weights that add up", () => {
    expect(PLAN_PARTS.reduce((sum, part) => sum + part.weight, 0)).toBe(100);
    const windows = rankMeetingWindows({
      ...base,
      memberSlots: [slotsOn(THU, [17, 18, 19, 20])],
    });
    for (const window of windows) {
      expect(window.score).toBeGreaterThanOrEqual(0);
      expect(window.score).toBeLessThanOrEqual(100);
    }
  });
});

describe("spreadMeetingWindows", () => {
  it("offers one option per day instead of the same evening twice", () => {
    const windows = rankMeetingWindows({
      ...base,
      memberSlots: [
        new Set([
          ...slotsOn(THU, [17, 18, 19, 20]),
          ...slotsOn(FRI, [17, 18, 19]),
        ]),
        new Set([
          ...slotsOn(THU, [17, 18, 19, 20]),
          ...slotsOn(FRI, [17, 18, 19]),
        ]),
      ],
    });
    const spread = spreadMeetingWindows(windows, 3);
    expect(spread.length).toBe(2);
    expect(new Set(spread.map((w) => w.date)).size).toBe(spread.length);
    expect(spread.map((w) => w.date)).toEqual([THU, FRI]);
  });
});
