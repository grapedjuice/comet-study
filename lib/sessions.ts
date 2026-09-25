import { UserFacingError } from "./app-errors";
import { transaction, type createDatabaseClient } from "./db";
import { membership, recordActivity, requireMember } from "./groups";
import { formatRange } from "./time";

type Database = ReturnType<typeof createDatabaseClient>;

export type RsvpStatus = "going" | "maybe" | "not_going";

export type StudySession = {
  id: string;
  groupId: string;
  groupName: string;
  courseCode: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  location: string | null;
  notes: string | null;
  status: "scheduled" | "cancelled";
  sequence: number;
  createdBy: string | null;
  createdByName: string | null;
  going: number;
  maybe: number;
  myRsvp: RsvpStatus | null;
};

type SessionRow = {
  id: string;
  group_id: string;
  group_name: string;
  course_code: string;
  title: string;
  starts_at: Date;
  ends_at: Date;
  location: string | null;
  notes: string | null;
  status: "scheduled" | "cancelled";
  sequence: number;
  created_by: string | null;
  created_by_name: string | null;
  going: string;
  maybe: string;
  my_rsvp: RsvpStatus | null;
};

const SESSION_SELECT = `
  select s.id, s.group_id, g.name as group_name, g.course_code, s.title, s.starts_at,
         s.ends_at, s.location, s.notes, s.status, s.sequence, s.created_by,
         cu.name as created_by_name,
         (select count(*) from session_rsvps r where r.session_id = s.id and r.status = 'going') as going,
         (select count(*) from session_rsvps r where r.session_id = s.id and r.status = 'maybe') as maybe,
         mine.status as my_rsvp
    from study_sessions s
    join study_groups g on g.id = s.group_id
    left join users cu on cu.id = s.created_by
    left join session_rsvps mine on mine.session_id = s.id and mine.user_id = $1`;

const toSession = (row: SessionRow): StudySession => ({
  id: row.id,
  groupId: row.group_id,
  groupName: row.group_name,
  courseCode: row.course_code,
  title: row.title,
  startsAt: row.starts_at,
  endsAt: row.ends_at,
  location: row.location,
  notes: row.notes,
  status: row.status,
  sequence: row.sequence,
  createdBy: row.created_by,
  createdByName: row.created_by_name,
  going: Number(row.going),
  maybe: Number(row.maybe),
  myRsvp: row.my_rsvp,
});

/** Sessions in a group: upcoming first, then the most recent past ones. */
export async function listGroupSessions(
  db: Database,
  userId: string,
  groupId: string,
) {
  const result = await db.pool.query<SessionRow>(
    `${SESSION_SELECT}
      where s.group_id = $2 and (s.ends_at > now() - interval '30 days')
      order by (s.ends_at > now()) desc,
               case when s.ends_at > now() then s.starts_at end asc,
               s.starts_at desc
      limit 40`,
    [userId, groupId],
  );
  return result.rows.map(toSession);
}

/** Every session in the student's active groups overlapping [from, to). */
export async function listMySessions(
  db: Database,
  userId: string,
  from: Date,
  to: Date,
  { includeCancelled = false } = {},
) {
  const result = await db.pool.query<SessionRow>(
    `${SESSION_SELECT}
      join group_members m on m.group_id = s.group_id and m.user_id = $1 and m.status = 'active'
      where s.starts_at < $3 and s.ends_at > $2 and g.status = 'active'
        ${includeCancelled ? "" : "and s.status = 'scheduled'"}
      order by s.starts_at
      limit 200`,
    [userId, from, to],
  );
  return result.rows.map(toSession);
}

export async function getSession(
  db: Database,
  userId: string,
  sessionId: string,
) {
  const result = await db.pool.query<SessionRow>(
    `${SESSION_SELECT} where s.id = $2`,
    [userId, sessionId],
  );
  return result.rows[0] ? toSession(result.rows[0]) : null;
}

export type SessionInput = {
  title: string;
  startsAt: Date;
  endsAt: Date;
  location: string | null;
  notes: string | null;
};

export function validateSessionTimes(
  startsAt: Date,
  endsAt: Date,
  now = new Date(),
) {
  const minutes = (endsAt.getTime() - startsAt.getTime()) / 60000;
  if (minutes < 15)
    throw new UserFacingError("Make the session at least 15 minutes");
  if (minutes > 8 * 60)
    throw new UserFacingError("Keep a session under 8 hours");
  if (startsAt.getTime() < now.getTime() - 5 * 60000)
    throw new UserFacingError("Pick a time that hasn’t passed yet");
  if (startsAt.getTime() > now.getTime() + 180 * 86400000)
    throw new UserFacingError("Schedule within the next six months");
}

export async function createSession(
  db: Database,
  userId: string,
  groupId: string,
  input: SessionInput,
) {
  validateSessionTimes(input.startsAt, input.endsAt);
  return transaction(db, async (client) => {
    await requireMember(client, groupId, userId);
    const upcoming = await client.query<{ count: string }>(
      "select count(*) from study_sessions where group_id = $1 and status = 'scheduled' and ends_at > now()",
      [groupId],
    );
    if (Number(upcoming.rows[0].count) >= 40)
      throw new UserFacingError("This group already has 40 upcoming sessions");
    const created = await client.query<{ id: string }>(
      `insert into study_sessions (group_id, title, starts_at, ends_at, location, notes, created_by)
       values ($1, $2, $3, $4, $5, $6, $7) returning id`,
      [
        groupId,
        input.title,
        input.startsAt,
        input.endsAt,
        input.location,
        input.notes,
        userId,
      ],
    );
    const id = created.rows[0].id;
    await client.query(
      "insert into session_rsvps (session_id, user_id, status) values ($1, $2, 'going')",
      [id, userId],
    );
    await recordActivity(
      client,
      groupId,
      userId,
      "session",
      `Scheduled “${input.title}” for ${formatRange(input.startsAt, input.endsAt)}`,
    );
    return id;
  });
}

async function sessionGroup(db: Database, sessionId: string) {
  const result = await db.pool.query<{
    group_id: string;
    created_by: string | null;
    status: string;
    title: string;
    ends_at: Date;
  }>(
    "select group_id, created_by, status, title, ends_at from study_sessions where id = $1",
    [sessionId],
  );
  const row = result.rows[0];
  if (!row) throw new UserFacingError("That session no longer exists");
  return row;
}

export async function cancelSession(
  db: Database,
  userId: string,
  sessionId: string,
) {
  const session = await sessionGroup(db, sessionId);
  const role = await requireMember(db.pool, session.group_id, userId);
  if (role !== "owner" && session.created_by !== userId)
    throw new UserFacingError(
      "Only the organizer or whoever scheduled it can cancel",
    );
  if (session.status === "cancelled") return;
  await db.pool.query(
    "update study_sessions set status = 'cancelled', sequence = sequence + 1, updated_at = now() where id = $1",
    [sessionId],
  );
  await recordActivity(
    db.pool,
    session.group_id,
    userId,
    "cancelled",
    `Cancelled “${session.title}”`,
  );
}

export async function setRsvp(
  db: Database,
  userId: string,
  sessionId: string,
  status: RsvpStatus,
) {
  const session = await sessionGroup(db, sessionId);
  await requireMember(db.pool, session.group_id, userId);
  if (session.status !== "scheduled")
    throw new UserFacingError("That session was cancelled");
  await db.pool.query(
    `insert into session_rsvps (session_id, user_id, status) values ($1, $2, $3)
     on conflict (session_id, user_id) do update set status = excluded.status, updated_at = now()`,
    [sessionId, userId, status],
  );
}

/* ---------- Exams ---------- */

export type ExamBadge =
  | "Unconfirmed"
  | "Reported"
  | "Likely"
  | "High confidence"
  | "Conflicting reports";

/** Confidence from active members' confirmations (spec §6.5). */
export function examConfidence(
  confirms: number,
  disputes: number,
  activeMembers: number,
): ExamBadge {
  if (disputes > 0) return "Conflicting reports";
  const ratio = activeMembers ? confirms / activeMembers : 0;
  if (confirms >= 4 || (confirms >= 2 && ratio >= 0.6))
    return "High confidence";
  if (confirms >= 2) return "Likely";
  if (confirms === 1) return "Reported";
  return "Unconfirmed";
}

export type Exam = {
  id: string;
  groupId: string;
  groupName: string;
  courseCode: string;
  kind: string;
  label: string;
  startsAt: Date;
  endsAt: Date | null;
  location: string | null;
  createdBy: string | null;
  confirms: number;
  disputes: number;
  myStance: "confirm" | "dispute" | null;
  badge: ExamBadge;
};

type ExamRow = {
  id: string;
  group_id: string;
  group_name: string;
  course_code: string;
  kind: string;
  label: string;
  starts_at: Date;
  ends_at: Date | null;
  location: string | null;
  created_by: string | null;
  confirms: string;
  disputes: string;
  members: string;
  my_stance: "confirm" | "dispute" | null;
};

// Only confirmations from current members count toward confidence.
const EXAM_SELECT = `
  select e.id, e.group_id, g.name as group_name, g.course_code, e.kind, e.label,
         e.starts_at, e.ends_at, e.location, e.created_by,
         (select count(*) from exam_confirmations c join group_members gm
             on gm.group_id = e.group_id and gm.user_id = c.user_id and gm.status = 'active'
           where c.exam_id = e.id and c.stance = 'confirm') as confirms,
         (select count(*) from exam_confirmations c join group_members gm
             on gm.group_id = e.group_id and gm.user_id = c.user_id and gm.status = 'active'
           where c.exam_id = e.id and c.stance = 'dispute') as disputes,
         (select count(*) from group_members gm where gm.group_id = e.group_id and gm.status = 'active') as members,
         mine.stance as my_stance
    from group_exams e
    join study_groups g on g.id = e.group_id
    left join exam_confirmations mine on mine.exam_id = e.id and mine.user_id = $1`;

const toExam = (row: ExamRow): Exam => {
  const confirms = Number(row.confirms);
  const disputes = Number(row.disputes);
  return {
    id: row.id,
    groupId: row.group_id,
    groupName: row.group_name,
    courseCode: row.course_code,
    kind: row.kind,
    label: row.label,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    location: row.location,
    createdBy: row.created_by,
    confirms,
    disputes,
    myStance: row.my_stance,
    badge: examConfidence(confirms, disputes, Number(row.members)),
  };
};

export async function listGroupExams(
  db: Database,
  userId: string,
  groupId: string,
) {
  const result = await db.pool.query<ExamRow>(
    `${EXAM_SELECT} where e.group_id = $2 and e.starts_at > now() - interval '14 days'
      order by e.starts_at limit 30`,
    [userId, groupId],
  );
  return result.rows.map(toExam);
}

export async function listMyExams(
  db: Database,
  userId: string,
  from: Date,
  to: Date,
) {
  const result = await db.pool.query<ExamRow>(
    `${EXAM_SELECT}
      join group_members m on m.group_id = e.group_id and m.user_id = $1 and m.status = 'active'
      where e.starts_at >= $2 and e.starts_at < $3 and g.status = 'active'
      order by e.starts_at limit 100`,
    [userId, from, to],
  );
  return result.rows.map(toExam);
}

export type ExamInput = {
  kind: string;
  label: string;
  startsAt: Date;
  endsAt: Date | null;
  location: string | null;
};

export async function createExam(
  db: Database,
  userId: string,
  groupId: string,
  input: ExamInput,
) {
  if (input.endsAt && input.endsAt <= input.startsAt)
    throw new UserFacingError("The exam has to end after it starts");
  await transaction(db, async (client) => {
    await requireMember(client, groupId, userId);
    const count = await client.query<{ count: string }>(
      "select count(*) from group_exams where group_id = $1 and starts_at > now()",
      [groupId],
    );
    if (Number(count.rows[0].count) >= 20)
      throw new UserFacingError("This group already tracks 20 upcoming exams");
    const created = await client.query<{ id: string }>(
      `insert into group_exams (group_id, kind, label, starts_at, ends_at, location, created_by)
       values ($1, $2, $3, $4, $5, $6, $7) returning id`,
      [
        groupId,
        input.kind,
        input.label,
        input.startsAt,
        input.endsAt,
        input.location,
        userId,
      ],
    );
    // Reporting an exam counts as one confirmation, not several.
    await client.query(
      "insert into exam_confirmations (exam_id, user_id, stance) values ($1, $2, 'confirm')",
      [created.rows[0].id, userId],
    );
    await recordActivity(
      client,
      groupId,
      userId,
      "exam",
      `Added ${input.label}`,
    );
  });
}

export async function setExamStance(
  db: Database,
  userId: string,
  examId: string,
  stance: "confirm" | "dispute" | null,
) {
  const exam = await db.pool.query<{ group_id: string }>(
    "select group_id from group_exams where id = $1",
    [examId],
  );
  if (!exam.rows[0]) throw new UserFacingError("That exam was removed");
  await requireMember(db.pool, exam.rows[0].group_id, userId);
  if (stance === null)
    await db.pool.query(
      "delete from exam_confirmations where exam_id = $1 and user_id = $2",
      [examId, userId],
    );
  else
    await db.pool.query(
      `insert into exam_confirmations (exam_id, user_id, stance) values ($1, $2, $3)
       on conflict (exam_id, user_id) do update set stance = excluded.stance, created_at = now()`,
      [examId, userId, stance],
    );
}

export async function deleteExam(db: Database, userId: string, examId: string) {
  const exam = await db.pool.query<{
    group_id: string;
    created_by: string | null;
    label: string;
  }>("select group_id, created_by, label from group_exams where id = $1", [
    examId,
  ]);
  const row = exam.rows[0];
  if (!row) return;
  const found = await membership(db.pool, row.group_id, userId);
  if (
    found?.status !== "active" ||
    (found.role !== "owner" && row.created_by !== userId)
  )
    throw new UserFacingError(
      "Only the organizer or whoever added it can remove it",
    );
  await db.pool.query("delete from group_exams where id = $1", [examId]);
  await recordActivity(
    db.pool,
    row.group_id,
    userId,
    "exam",
    `Removed ${row.label}`,
  );
}
