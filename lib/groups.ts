import type { PoolClient } from "pg";
import { publicName, UserFacingError } from "./app-errors";
import { transaction, type createDatabaseClient } from "./db";

type Database = ReturnType<typeof createDatabaseClient>;
type Queryable = Database["pool"] | PoolClient;

export const MIN_CAPACITY = 4;
export const MAX_CAPACITY = 8;
export const MAX_GROUPS_PER_COURSE = 3;

export type MemberStatus = "active" | "pending" | "invited";
export type Role = "owner" | "member";

export type GroupSummary = {
  id: string;
  name: string;
  description: string | null;
  courseCode: string;
  courseTitle: string;
  sectionNumber: string | null;
  capacity: number;
  joinPolicy: "open" | "request";
  modality: string;
  styles: string[];
  goals: string[];
  cadence: string | null;
  status: "active" | "archived";
  memberCount: number;
  members: { id: string; name: string }[];
  myRole: Role | null;
  myStatus: MemberStatus | null;
  pendingCount: number;
  nextSession: {
    id: string;
    title: string;
    startsAt: Date;
    endsAt: Date;
    location: string | null;
  } | null;
};

type GroupRow = {
  id: string;
  name: string;
  description: string | null;
  course_code: string;
  course_title: string;
  section_number: string | null;
  capacity: number;
  join_policy: "open" | "request";
  modality: string;
  styles: string[];
  goals: string[];
  cadence: string | null;
  status: "active" | "archived";
  member_count: string;
  members: { id: string; name: string | null; email: string }[] | null;
  my_role: Role | null;
  my_status: MemberStatus | null;
  pending_count: string;
  next_session: {
    id: string;
    title: string;
    starts_at: string;
    ends_at: string;
    location: string | null;
  } | null;
};

// One query shape for every group listing: counts, a member preview and the
// next session come from lateral subqueries, so a page never goes N+1.
const GROUP_SELECT = `
  select g.id, g.name, g.description, g.course_code, c.title as course_title,
         g.section_number, g.capacity, g.join_policy, g.modality, g.styles,
         g.goals, g.cadence, g.status,
         (select count(*) from group_members m
           where m.group_id = g.id and m.status = 'active') as member_count,
         (select json_agg(json_build_object('id', u.id, 'name', u.name, 'email', u.email_normalized)
                          order by m.joined_at)
            from (select * from group_members m
                   where m.group_id = g.id and m.status = 'active'
                   order by m.joined_at limit 6) m
            join users u on u.id = m.user_id) as members,
         me.role as my_role, me.status as my_status,
         (select count(*) from group_members p
           where p.group_id = g.id and p.status = 'pending') as pending_count,
         (select json_build_object('id', s.id, 'title', s.title, 'starts_at', s.starts_at,
                                   'ends_at', s.ends_at, 'location', s.location)
            from study_sessions s
           where s.group_id = g.id and s.status = 'scheduled' and s.ends_at > now()
           order by s.starts_at limit 1) as next_session
    from study_groups g
    join catalog_courses c on c.code = g.course_code
    left join group_members me on me.group_id = g.id and me.user_id = $1`;

function toSummary(row: GroupRow, viewerIsMember: boolean): GroupSummary {
  const session = row.next_session;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    courseCode: row.course_code,
    courseTitle: row.course_title,
    sectionNumber: row.section_number,
    capacity: row.capacity,
    joinPolicy: row.join_policy,
    modality: row.modality,
    styles: row.styles,
    goals: row.goals,
    cadence: row.cadence,
    status: row.status,
    memberCount: Number(row.member_count),
    // Outsiders see first names and initials, never emails.
    members: (row.members ?? []).map((member) => ({
      id: member.id,
      name: viewerIsMember
        ? (member.name ?? member.email.split("@")[0])
        : publicName(member.name),
    })),
    myRole: row.my_role,
    myStatus: row.my_status,
    pendingCount: Number(row.pending_count),
    nextSession:
      session && viewerIsMember
        ? {
            id: session.id,
            title: session.title,
            startsAt: new Date(session.starts_at),
            endsAt: new Date(session.ends_at),
            location: session.location,
          }
        : null,
  };
}

/** Groups the student belongs to (active) plus invitations and requests. */
export async function listMyGroups(db: Database, userId: string, term: string) {
  const result = await db.pool.query<GroupRow>(
    `${GROUP_SELECT}
      where g.term = $2 and g.status = 'active' and me.user_id is not null
      order by (me.status = 'active') desc, g.course_code, g.created_at`,
    [userId, term],
  );
  return result.rows.map((row) => toSummary(row, row.my_status === "active"));
}

/** Active groups in the student's courses this term that they could join. */
export async function listCourseGroups(
  db: Database,
  userId: string,
  term: string,
) {
  const result = await db.pool.query<GroupRow>(
    `${GROUP_SELECT}
      where g.term = $2 and g.status = 'active'
        and g.course_code in (select course_code from user_courses
                               where user_id = $1 and term = $2)
        and (me.status is null or me.status <> 'active')
        and not exists (select 1 from match_dismissals d
                         where d.user_id = $1 and d.target_type = 'group'
                           and d.target_id = g.id)
      order by g.course_code, g.created_at desc
      limit 60`,
    [userId, term],
  );
  return result.rows.map((row) => toSummary(row, false));
}

export async function getGroup(db: Database, userId: string, groupId: string) {
  const result = await db.pool.query<GroupRow & { term: string }>(
    `${GROUP_SELECT.replace("select g.id,", "select g.term, g.id,")} where g.id = $2`,
    [userId, groupId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return { ...toSummary(row, row.my_status === "active"), term: row.term };
}

export type Member = {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: MemberStatus;
  joinedAt: Date | null;
  sessionsAttended: number;
};

/** Full roster; only call for active members of the group. */
export async function listMembers(db: Database, groupId: string) {
  const result = await db.pool.query<{
    id: string;
    name: string | null;
    email: string;
    role: Role;
    status: MemberStatus;
    joined_at: Date | null;
    attended: string;
  }>(
    `select u.id, u.name, u.email_normalized as email, m.role, m.status, m.joined_at,
            (select count(*) from session_rsvps r
               join study_sessions s on s.id = r.session_id
              where r.user_id = u.id and s.group_id = m.group_id
                and r.status = 'going' and s.status = 'scheduled'
                and s.ends_at < now()) as attended
       from group_members m join users u on u.id = m.user_id
      where m.group_id = $1
      order by (m.role = 'owner') desc, m.status, m.joined_at nulls last, u.name`,
    [groupId],
  );
  return result.rows.map<Member>((row) => ({
    id: row.id,
    name: row.name ?? row.email.split("@")[0],
    email: row.email,
    role: row.role,
    status: row.status,
    joinedAt: row.joined_at,
    sessionsAttended: Number(row.attended),
  }));
}

export async function membership(
  db: Queryable,
  groupId: string,
  userId: string,
) {
  const result = await db.query<{ role: Role; status: MemberStatus }>(
    "select role, status from group_members where group_id = $1 and user_id = $2",
    [groupId, userId],
  );
  return result.rows[0] ?? null;
}

/** Throws unless the user is an active member; returns their role. */
export async function requireMember(
  db: Queryable,
  groupId: string,
  userId: string,
) {
  const found = await membership(db, groupId, userId);
  if (found?.status !== "active")
    throw new UserFacingError("Only members of this group can do that");
  return found.role;
}

export async function requireOwner(
  db: Queryable,
  groupId: string,
  userId: string,
) {
  if ((await requireMember(db, groupId, userId)) !== "owner")
    throw new UserFacingError("Only the group organizer can do that");
}

export async function recordActivity(
  db: Queryable,
  groupId: string,
  actorId: string | null,
  kind: string,
  summary: string,
) {
  await db.query(
    "insert into group_activity (group_id, actor_id, kind, summary) values ($1, $2, $3, $4)",
    [groupId, actorId, kind, summary.slice(0, 200)],
  );
}

export async function listActivity(db: Database, groupId: string, limit = 12) {
  const result = await db.pool.query<{
    id: string;
    kind: string;
    summary: string;
    created_at: Date;
    actor: string | null;
  }>(
    `select a.id, a.kind, a.summary, a.created_at, u.name as actor
       from group_activity a left join users u on u.id = a.actor_id
      where a.group_id = $1 order by a.created_at desc limit $2`,
    [groupId, limit],
  );
  return result.rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    summary: row.summary,
    createdAt: row.created_at,
    actor: row.actor,
  }));
}

async function lockGroup(client: PoolClient, groupId: string) {
  const result = await client.query<{
    id: string;
    course_code: string;
    term: string;
    capacity: number;
    join_policy: "open" | "request";
    status: string;
    name: string;
  }>(
    "select id, course_code, term, capacity, join_policy, status, name from study_groups where id = $1 for update",
    [groupId],
  );
  const group = result.rows[0];
  if (!group || group.status !== "active")
    throw new UserFacingError("That group isn’t open anymore");
  return group;
}

async function activeCount(client: PoolClient, groupId: string) {
  const result = await client.query<{ count: string }>(
    "select count(*) from group_members where group_id = $1 and status = 'active'",
    [groupId],
  );
  return Number(result.rows[0].count);
}

async function takesCourse(
  client: Queryable,
  userId: string,
  course: string,
  term: string,
) {
  const result = await client.query(
    "select 1 from user_courses where user_id = $1 and course_code = $2 and term = $3",
    [userId, course, term],
  );
  return (result.rowCount ?? 0) > 0;
}

async function nameOf(client: Queryable, userId: string) {
  const result = await client.query<{ name: string | null; email: string }>(
    "select name, email_normalized as email from users where id = $1",
    [userId],
  );
  const row = result.rows[0];
  return publicName(row?.name ?? null, row?.email);
}

export type GroupInput = {
  courseCode: string;
  name: string;
  description: string | null;
  capacity: number;
  joinPolicy: "open" | "request";
  modality: string;
  styles: string[];
  goals: string[];
  cadence: string | null;
};

export async function createGroup(
  db: Database,
  userId: string,
  term: string,
  input: GroupInput,
) {
  return transaction(db, async (client) => {
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [
      `groups:${userId}`,
    ]);
    const course = await client.query<{ section_number: string | null }>(
      "select section_number from user_courses where user_id = $1 and course_code = $2 and term = $3",
      [userId, input.courseCode, term],
    );
    if (!course.rows[0])
      throw new UserFacingError("Add this course to your schedule first");
    const owned = await client.query<{ count: string }>(
      `select count(*) from study_groups g join group_members m on m.group_id = g.id
        where m.user_id = $1 and m.role = 'owner' and g.course_code = $2
          and g.term = $3 and g.status = 'active'`,
      [userId, input.courseCode, term],
    );
    if (Number(owned.rows[0].count) >= MAX_GROUPS_PER_COURSE)
      throw new UserFacingError(
        `You can organize up to ${MAX_GROUPS_PER_COURSE} groups per course`,
      );
    const created = await client.query<{ id: string }>(
      `insert into study_groups (course_code, term, section_number, name, description, capacity,
                                 join_policy, modality, styles, goals, cadence, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) returning id`,
      [
        input.courseCode,
        term,
        course.rows[0].section_number,
        input.name,
        input.description,
        input.capacity,
        input.joinPolicy,
        input.modality,
        input.styles,
        input.goals,
        input.cadence,
        userId,
      ],
    );
    const groupId = created.rows[0].id;
    await client.query(
      "insert into group_members (group_id, user_id, role, status, joined_at) values ($1, $2, 'owner', 'active', now())",
      [groupId, userId],
    );
    await recordActivity(
      client,
      groupId,
      userId,
      "created",
      `${await nameOf(client, userId)} started the group`,
    );
    return groupId;
  });
}

export async function updateGroup(
  db: Database,
  userId: string,
  groupId: string,
  input: Omit<GroupInput, "courseCode">,
) {
  await transaction(db, async (client) => {
    await requireOwner(client, groupId, userId);
    await lockGroup(client, groupId);
    if ((await activeCount(client, groupId)) > input.capacity)
      throw new UserFacingError(
        "The group already has more members than that size",
      );
    await client.query(
      `update study_groups set name = $2, description = $3, capacity = $4, join_policy = $5,
              modality = $6, styles = $7, goals = $8, cadence = $9, updated_at = now()
        where id = $1`,
      [
        groupId,
        input.name,
        input.description,
        input.capacity,
        input.joinPolicy,
        input.modality,
        input.styles,
        input.goals,
        input.cadence,
      ],
    );
    await recordActivity(
      client,
      groupId,
      userId,
      "updated",
      "Group details were updated",
    );
  });
}

/**
 * Join an open group, request to join a request-only group, or accept an
 * invitation. The group row is locked so concurrent joins can't overfill it.
 */
export async function joinGroup(db: Database, userId: string, groupId: string) {
  return transaction(db, async (client): Promise<MemberStatus> => {
    const group = await lockGroup(client, groupId);
    if (!(await takesCourse(client, userId, group.course_code, group.term)))
      throw new UserFacingError(
        `Add ${group.course_code} to your courses to join this group`,
      );
    const existing = await membership(client, groupId, userId);
    if (existing?.status === "active") return "active";
    if (existing?.status === "pending") return "pending";
    const invited = existing?.status === "invited";
    if (!invited && group.join_policy === "request") {
      await client.query(
        "insert into group_members (group_id, user_id, role, status) values ($1, $2, 'member', 'pending')",
        [groupId, userId],
      );
      return "pending";
    }
    if ((await activeCount(client, groupId)) >= group.capacity)
      throw new UserFacingError("That group just filled up");
    await client.query(
      `insert into group_members (group_id, user_id, role, status, joined_at)
       values ($1, $2, 'member', 'active', now())
       on conflict (group_id, user_id) do update set status = 'active', joined_at = now()`,
      [groupId, userId],
    );
    await recordActivity(
      client,
      groupId,
      userId,
      "joined",
      `${await nameOf(client, userId)} joined`,
    );
    return "active";
  });
}

/** Leave, withdraw a request, or decline an invitation. */
export async function leaveGroup(
  db: Database,
  userId: string,
  groupId: string,
) {
  await transaction(db, async (client) => {
    await lockGroup(client, groupId).catch(() => undefined);
    const existing = await membership(client, groupId, userId);
    if (!existing) return;
    await client.query(
      "delete from group_members where group_id = $1 and user_id = $2",
      [groupId, userId],
    );
    if (existing.status !== "active") return;
    await recordActivity(
      client,
      groupId,
      userId,
      "left",
      `${await nameOf(client, userId)} left`,
    );
    if (existing.role !== "owner") return;
    // Hand the group to the longest-standing member, or archive an empty one.
    const next = await client.query<{ user_id: string }>(
      "select user_id from group_members where group_id = $1 and status = 'active' order by joined_at limit 1",
      [groupId],
    );
    if (next.rows[0]) {
      await client.query(
        "update group_members set role = 'owner' where group_id = $1 and user_id = $2",
        [groupId, next.rows[0].user_id],
      );
      await recordActivity(
        client,
        groupId,
        null,
        "owner",
        `${await nameOf(client, next.rows[0].user_id)} is now the organizer`,
      );
    } else {
      await client.query(
        "update study_groups set status = 'archived', updated_at = now() where id = $1",
        [groupId],
      );
      await client.query("delete from group_members where group_id = $1", [
        groupId,
      ]);
    }
  });
}

export async function answerRequest(
  db: Database,
  ownerId: string,
  groupId: string,
  userId: string,
  approve: boolean,
) {
  await transaction(db, async (client) => {
    await requireOwner(client, groupId, ownerId);
    const group = await lockGroup(client, groupId);
    const existing = await membership(client, groupId, userId);
    if (existing?.status !== "pending")
      throw new UserFacingError("That request was already handled");
    if (!approve) {
      await client.query(
        "delete from group_members where group_id = $1 and user_id = $2",
        [groupId, userId],
      );
      return;
    }
    if ((await activeCount(client, groupId)) >= group.capacity)
      throw new UserFacingError("The group is full — raise the size first");
    await client.query(
      "update group_members set status = 'active', joined_at = now() where group_id = $1 and user_id = $2",
      [groupId, userId],
    );
    await recordActivity(
      client,
      groupId,
      userId,
      "joined",
      `${await nameOf(client, userId)} joined`,
    );
  });
}

export async function inviteToGroup(
  db: Database,
  inviterId: string,
  groupId: string,
  inviteeId: string,
) {
  await transaction(db, async (client) => {
    await requireMember(client, groupId, inviterId);
    const group = await lockGroup(client, groupId);
    if (inviteeId === inviterId)
      throw new UserFacingError("You’re already in this group");
    const profile = await client.query<{ discoverable: boolean }>(
      "select coalesce((select discoverable from study_profiles where user_id = $1), true) as discoverable",
      [inviteeId],
    );
    if (
      !profile.rows[0].discoverable ||
      !(await takesCourse(client, inviteeId, group.course_code, group.term))
    )
      throw new UserFacingError("That classmate can’t be invited");
    const existing = await membership(client, groupId, inviteeId);
    if (existing?.status === "active")
      throw new UserFacingError("They’re already in the group");
    if ((await activeCount(client, groupId)) >= group.capacity)
      throw new UserFacingError("The group is full");
    if (existing?.status === "pending") {
      // They already asked; an invite from a member is as good as approval.
      await client.query(
        "update group_members set status = 'active', joined_at = now() where group_id = $1 and user_id = $2",
        [groupId, inviteeId],
      );
      return;
    }
    await client.query(
      `insert into group_members (group_id, user_id, role, status, invited_by)
       values ($1, $2, 'member', 'invited', $3) on conflict do nothing`,
      [groupId, inviteeId, inviterId],
    );
    await recordActivity(
      client,
      groupId,
      inviterId,
      "invited",
      `${await nameOf(client, inviterId)} invited ${await nameOf(client, inviteeId)}`,
    );
  });
}

export async function removeMember(
  db: Database,
  ownerId: string,
  groupId: string,
  userId: string,
) {
  if (ownerId === userId)
    throw new UserFacingError("Use “Leave group” to remove yourself");
  await transaction(db, async (client) => {
    await requireOwner(client, groupId, ownerId);
    const removed = await client.query(
      "delete from group_members where group_id = $1 and user_id = $2",
      [groupId, userId],
    );
    if (removed.rowCount)
      await recordActivity(
        client,
        groupId,
        ownerId,
        "removed",
        `${await nameOf(client, userId)} was removed`,
      );
  });
}

export async function transferOwnership(
  db: Database,
  ownerId: string,
  groupId: string,
  userId: string,
) {
  await transaction(db, async (client) => {
    await requireOwner(client, groupId, ownerId);
    const target = await membership(client, groupId, userId);
    if (target?.status !== "active")
      throw new UserFacingError("Pick a current member");
    await client.query(
      "update group_members set role = case when user_id = $2 then 'owner' else 'member' end where group_id = $1 and user_id in ($2, $3)",
      [groupId, userId, ownerId],
    );
    await recordActivity(
      client,
      groupId,
      ownerId,
      "owner",
      `${await nameOf(client, userId)} is now the organizer`,
    );
  });
}

export async function archiveGroup(
  db: Database,
  ownerId: string,
  groupId: string,
) {
  await transaction(db, async (client) => {
    await requireOwner(client, groupId, ownerId);
    await client.query(
      "update study_groups set status = 'archived', updated_at = now() where id = $1",
      [groupId],
    );
    await recordActivity(
      client,
      groupId,
      ownerId,
      "archived",
      "The group was archived",
    );
  });
}

export async function dismissMatch(
  db: Database,
  userId: string,
  targetType: "group" | "user",
  targetId: string,
  undo = false,
) {
  await db.pool.query(
    undo
      ? "delete from match_dismissals where user_id = $1 and target_type = $2 and target_id = $3"
      : "insert into match_dismissals (user_id, target_type, target_id) values ($1, $2, $3) on conflict do nothing",
    [userId, targetType, targetId],
  );
}

/** Classmates in the group's course who could be invited (discoverable, not in it). */
export async function listInvitable(db: Database, groupId: string) {
  const result = await db.pool.query<{
    id: string;
    name: string | null;
    email: string;
    section_number: string | null;
    same_section: boolean;
  }>(
    `select u.id, u.name, u.email_normalized as email, uc.section_number,
            (uc.section_number is not distinct from g.section_number and g.section_number is not null) as same_section
       from study_groups g
       join user_courses uc on uc.course_code = g.course_code and uc.term = g.term
       join users u on u.id = uc.user_id
       left join study_profiles p on p.user_id = u.id
      where g.id = $1 and coalesce(p.discoverable, true)
        and u.account_status = 'active' and u.onboarding_completed_at is not null
        and not exists (select 1 from group_members m where m.group_id = g.id and m.user_id = u.id)
      order by same_section desc, u.name
      limit 40`,
    [groupId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    name: publicName(row.name, row.email),
    sectionNumber: row.section_number,
    sameSection: row.same_section,
  }));
}
