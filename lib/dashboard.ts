import { listMyCampusExams } from "./campus-exams";
import { listUserCourses } from "./courses";
import type { createDatabaseClient } from "./db";
import { listCourseGroups, listMyGroups, type GroupSummary } from "./groups";
import { getProfile } from "./matching";
import { listResources } from "./resources";
import { listMyExams, listMySessions } from "./sessions";

type Database = ReturnType<typeof createDatabaseClient>;

export type Action =
  | { kind: "invite"; groupId: string; groupName: string; courseCode: string }
  | { kind: "request"; groupId: string; groupName: string; count: number }
  | {
      kind: "rsvp";
      sessionId: string;
      title: string;
      groupName: string;
      startsAt: Date;
      endsAt: Date;
    }
  | {
      kind: "exam";
      examId: string;
      label: string;
      courseCode: string;
      startsAt: Date;
    }
  | {
      kind: "find-groups";
      courses: { code: string; openGroups: number }[];
    }
  | { kind: "availability" }
  | { kind: "first-session"; groupId: string; groupName: string };

/**
 * Everything the home screen needs in a fixed number of bounded queries.
 * Action cards come only from stored facts.
 */
export async function loadDashboard(
  db: Database,
  userId: string,
  term: string,
  now = new Date(),
) {
  const horizon = new Date(now.getTime() + 21 * 86400000);
  const [
    courses,
    groups,
    openGroups,
    sessions,
    exams,
    campusExams,
    profile,
    resources,
  ] = await Promise.all([
    listUserCourses(db, userId, term),
    listMyGroups(db, userId, term),
    listCourseGroups(db, userId, term),
    listMySessions(db, userId, new Date(now.getTime() - 60 * 60000), horizon),
    listMyExams(db, userId, now, new Date(now.getTime() + 60 * 86400000)),
    // Through finals, which are usually more than 60 days out.
    listMyCampusExams(
      db,
      userId,
      now,
      new Date(now.getTime() + 150 * 86400000),
    ),
    getProfile(db, userId),
    listResources(db, userId, {}, 5),
  ]);

  const active = groups.filter((g) => g.myStatus === "active");
  const actions: Action[] = [];
  for (const g of groups)
    if (g.myStatus === "invited")
      actions.push({
        kind: "invite",
        groupId: g.id,
        groupName: g.name,
        courseCode: g.courseCode,
      });
  for (const g of active)
    if (g.myRole === "owner" && g.pendingCount)
      actions.push({
        kind: "request",
        groupId: g.id,
        groupName: g.name,
        count: g.pendingCount,
      });
  for (const s of sessions)
    if (
      !s.myRsvp &&
      s.startsAt > now &&
      s.startsAt < new Date(now.getTime() + 7 * 86400000)
    )
      actions.push({
        kind: "rsvp",
        sessionId: s.id,
        title: s.title,
        groupName: s.groupName,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
      });
  for (const e of exams)
    if (!e.myStance && e.confirms < 2)
      actions.push({
        kind: "exam",
        examId: e.id,
        label: e.label,
        courseCode: e.courseCode,
        startsAt: e.startsAt,
      });
  const groupedCourses = new Set(active.map((g) => g.courseCode));
  const ungrouped = courses
    .filter((c) => !groupedCourses.has(c.code))
    .map((c) => ({
      code: c.code,
      openGroups: openGroups.filter(
        (g) => g.courseCode === c.code && g.memberCount < g.capacity,
      ).length,
    }));
  // One row for every course still without a group, not one card each.
  if (ungrouped.length)
    actions.push({ kind: "find-groups", courses: ungrouped });
  if (!profile.availability.length) actions.push({ kind: "availability" });
  for (const g of active)
    if (!g.nextSession && g.myRole === "owner")
      actions.push({ kind: "first-session", groupId: g.id, groupName: g.name });

  const byCourse = new Map<string, GroupSummary[]>();
  for (const g of active)
    byCourse.set(g.courseCode, [...(byCourse.get(g.courseCode) ?? []), g]);

  return {
    courses: courses.map((course) => ({
      ...course,
      groups: byCourse.get(course.code) ?? [],
      openGroups: openGroups.filter((g) => g.courseCode === course.code).length,
    })),
    groups: active,
    sessions: sessions.filter((s) => s.endsAt > now),
    exams,
    campusExams,
    actions: actions.slice(0, 8),
    resources,
    profile,
  };
}
