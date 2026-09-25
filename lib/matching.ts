import { publicName } from "./app-errors";
import { parseSchedule } from "./calendar";
import type { createDatabaseClient } from "./db";
import { labelOf, STUDY_GOALS, STUDY_STYLES } from "./study-options";

type Database = ReturnType<typeof createDatabaseClient>;

export const SCORE_VERSION = "v1";
const HOURS_PER_WEEK = 7 * 24;

/* ---------- Profile ---------- */

export type StudyProfile = {
  styles: string[];
  goals: string[];
  modality: "in_person" | "online" | "either";
  preferredSize: number;
  availability: number[];
  discoverable: boolean;
  saved: boolean;
};

export async function getProfile(
  db: Database,
  userId: string,
): Promise<StudyProfile> {
  const result = await db.pool.query<{
    styles: string[];
    goals: string[];
    modality: StudyProfile["modality"];
    preferred_size: number;
    availability: number[];
    discoverable: boolean;
  }>(
    "select styles, goals, modality, preferred_size, availability, discoverable from study_profiles where user_id = $1",
    [userId],
  );
  const row = result.rows[0];
  if (!row)
    return {
      styles: [],
      goals: [],
      modality: "either",
      preferredSize: 5,
      availability: [],
      discoverable: true,
      saved: false,
    };
  return {
    styles: row.styles,
    goals: row.goals,
    modality: row.modality,
    preferredSize: row.preferred_size,
    availability: row.availability,
    discoverable: row.discoverable,
    saved: true,
  };
}

export async function saveProfile(
  db: Database,
  userId: string,
  profile: Omit<StudyProfile, "saved">,
) {
  const slots = [...new Set(profile.availability)]
    .filter(
      (slot) => Number.isInteger(slot) && slot >= 0 && slot < HOURS_PER_WEEK,
    )
    .sort((a, b) => a - b);
  await db.pool.query(
    `insert into study_profiles (user_id, styles, goals, modality, preferred_size, availability, discoverable, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, now())
     on conflict (user_id) do update set styles = excluded.styles, goals = excluded.goals,
       modality = excluded.modality, preferred_size = excluded.preferred_size,
       availability = excluded.availability, discoverable = excluded.discoverable, updated_at = now()`,
    [
      userId,
      profile.styles,
      profile.goals,
      profile.modality,
      profile.preferredSize,
      slots,
      profile.discoverable,
    ],
  );
}

/* ---------- Scoring (pure) ---------- */

/** Hour slots covered by class meetings, from stored section schedules. */
export function classSlots(
  schedules: { code: string; schedule: string | null }[],
) {
  const busy = new Set<number>();
  for (const { code, schedule } of schedules)
    for (const block of parseSchedule(code, schedule))
      for (let m = block.start - (block.start % 60); m < block.end; m += 60)
        busy.add(block.weekday * 24 + Math.floor(m / 60));
  return busy;
}

/** Free slots: what the student marked, minus their own classes. */
export function freeSlots(
  availability: number[],
  schedules: { code: string; schedule: string | null }[],
) {
  const busy = classSlots(schedules);
  return new Set(availability.filter((slot) => !busy.has(slot)));
}

/** Slots at least `quorum` members share. */
export function groupSlots(members: Set<number>[], quorum: number) {
  const counts = new Map<number, number>();
  for (const slots of members)
    for (const slot of slots) counts.set(slot, (counts.get(slot) ?? 0) + 1);
  return new Set(
    [...counts].filter(([, n]) => n >= quorum).map(([slot]) => slot),
  );
}

/** Runs of consecutive shared hours within a day, as hour counts. */
export function overlapWindows(a: Set<number>, b: Set<number>) {
  const windows: { day: number; start: number; hours: number }[] = [];
  for (let day = 0; day < 7; day++) {
    let run = 0;
    for (let hour = 0; hour <= 24; hour++) {
      const slot = day * 24 + hour;
      if (hour < 24 && a.has(slot) && b.has(slot)) run++;
      else if (run) {
        windows.push({ day, start: hour - run, hours: run });
        run = 0;
      }
    }
  }
  return windows;
}

/** |A∩B| / |A∪B| with equal weights; 0.5 when neither side said anything. */
export function jaccard(a: string[], b: string[]) {
  const A = new Set(a);
  const B = new Set(b);
  const union = new Set([...A, ...B]);
  if (!union.size) return 0.5;
  if (!A.size || !B.size) return 0.4;
  return [...A].filter((x) => B.has(x)).length / union.size;
}

export function modalityFit(seeker: string, target: string) {
  if (seeker === "either" || target === "either") return 1;
  if (seeker === target) return 1;
  if (target === "hybrid" || seeker === "hybrid") return 0.75;
  return 0.25;
}

export type MatchTarget = {
  slots: Set<number> | null; // null: nothing shared to compare
  styles: string[];
  goals: string[];
  modality: string;
  sameSection: boolean;
  capacity?: number;
  seatsLeft?: number;
};

export type MatchSeeker = {
  slots: Set<number> | null;
  styles: string[];
  goals: string[];
  modality: string;
  preferredSize: number;
};

const clamp = (value: number) => Math.min(1, Math.max(0, value));

/** Deterministic, versioned score in [0, 100] with plain-language reasons. */
export function scoreMatch(seeker: MatchSeeker, target: MatchTarget) {
  const windows =
    seeker.slots && target.slots
      ? overlapWindows(seeker.slots, target.slots)
      : null;
  const usefulMinutes = windows
    ? windows.reduce((sum, w) => sum + Math.min(w.hours * 60, 180), 0)
    : null;
  const overlap = usefulMinutes === null ? 0.5 : clamp(usefulMinutes / 360);
  const style = jaccard(seeker.styles, target.styles);
  const goals = jaccard(seeker.goals, target.goals);
  const modality = modalityFit(seeker.modality, target.modality);
  const location = target.sameSection ? 1 : 0.5;
  const size =
    target.capacity === undefined
      ? 0.5
      : clamp(1 - Math.abs(target.capacity - seeker.preferredSize) / 4);
  const reliability = 0.5;
  const raw =
    0.4 * overlap +
    0.2 * style +
    0.15 * goals +
    0.1 * modality +
    0.05 * location +
    0.07 * size +
    0.03 * reliability;

  const reasons: string[] = [];
  if (windows?.length) {
    const long = windows.filter((w) => w.hours >= 2).length;
    reasons.push(
      long
        ? `${long} shared ${long === 1 ? "window" : "windows"} of 2+ hours a week`
        : `${windows.length} shared free ${windows.length === 1 ? "hour" : "hours"} a week`,
    );
  } else if (windows) reasons.push("No shared free time yet");
  const sharedStyles = seeker.styles.filter((s) => target.styles.includes(s));
  if (sharedStyles.length)
    reasons.push(
      `Both like ${labelOf(STUDY_STYLES, sharedStyles[0]).toLowerCase()}`,
    );
  const sharedGoals = seeker.goals.filter((g) => target.goals.includes(g));
  if (sharedGoals.length)
    reasons.push(
      `Same goal: ${labelOf(STUDY_GOALS, sharedGoals[0]).toLowerCase()}`,
    );
  if (target.sameSection) reasons.push("Same section");
  if (target.seatsLeft !== undefined)
    reasons.push(
      `${target.seatsLeft} ${target.seatsLeft === 1 ? "seat" : "seats"} left`,
    );

  return {
    score: Math.round(100 * clamp(raw)),
    scoreVersion: SCORE_VERSION,
    windows: windows?.length ?? 0,
    components: {
      overlap,
      style,
      goals,
      modality,
      location,
      size,
      reliability,
    },
    reasons,
  };
}

/* ---------- Candidates ---------- */

export type GroupMatch = {
  kind: "group";
  id: string;
  name: string;
  description: string | null;
  sectionNumber: string | null;
  memberCount: number;
  capacity: number;
  joinPolicy: "open" | "request";
  modality: string;
  styles: string[];
  cadence: string | null;
  myStatus: "pending" | "invited" | null;
  members: string[];
  score: number;
  windows: number;
  reasons: string[];
};

export type PersonMatch = {
  kind: "person";
  id: string;
  name: string;
  sectionNumber: string | null;
  styles: string[];
  goals: string[];
  inMyGroup: boolean;
  invitedTo: string[];
  score: number;
  windows: number;
  reasons: string[];
};

type MemberData = {
  id: string;
  name: string | null;
  availability: number[] | null;
  schedules: { code: string; schedule: string | null }[] | null;
};

const toSlots = (member: MemberData) =>
  member.availability?.length
    ? freeSlots(member.availability, member.schedules ?? [])
    : null;

export async function findMatches(
  db: Database,
  userId: string,
  term: string,
  courseCode: string,
) {
  const [me, mine] = await Promise.all([
    getProfile(db, userId),
    db.pool.query<{
      section_number: string | null;
      schedules: MemberData["schedules"];
    }>(
      `select (select section_number from user_courses where user_id = $1 and term = $2 and course_code = $3) as section_number,
              (select json_agg(json_build_object('code', course_code, 'schedule', schedule))
                 from user_courses where user_id = $1 and term = $2) as schedules`,
      [userId, term, courseCode],
    ),
  ]);
  const mySection = mine.rows[0]?.section_number ?? null;
  const seeker: MatchSeeker = {
    slots: me.availability.length
      ? freeSlots(me.availability, mine.rows[0]?.schedules ?? [])
      : null,
    styles: me.styles,
    goals: me.goals,
    modality: me.modality,
    preferredSize: me.preferredSize,
  };

  const groupRows = await db.pool.query<{
    id: string;
    name: string;
    description: string | null;
    section_number: string | null;
    capacity: number;
    join_policy: "open" | "request";
    modality: string;
    styles: string[];
    goals: string[];
    cadence: string | null;
    my_status: "pending" | "invited" | null;
    members: MemberData[];
  }>(
    `select g.id, g.name, g.description, g.section_number, g.capacity, g.join_policy,
            g.modality, g.styles, g.goals, g.cadence, me.status as my_status,
            (select json_agg(json_build_object(
                      'id', u.id, 'name', u.name, 'availability', p.availability,
                      'schedules', (select json_agg(json_build_object('code', uc.course_code, 'schedule', uc.schedule))
                                      from user_courses uc where uc.user_id = u.id and uc.term = g.term)))
               from group_members m join users u on u.id = m.user_id
               left join study_profiles p on p.user_id = u.id
              where m.group_id = g.id and m.status = 'active') as members
       from study_groups g
       left join group_members me on me.group_id = g.id and me.user_id = $1
      where g.course_code = $3 and g.term = $2 and g.status = 'active'
        and (me.status is null or me.status <> 'active')
        and not exists (select 1 from match_dismissals d where d.user_id = $1
                         and d.target_type = 'group' and d.target_id = g.id)
      limit 60`,
    [userId, term, courseCode],
  );

  const groups: GroupMatch[] = [];
  for (const row of groupRows.rows) {
    const members = row.members ?? [];
    const seatsLeft = row.capacity - members.length;
    if (seatsLeft <= 0 && row.my_status !== "invited") continue;
    const memberSlots = members
      .map(toSlots)
      .filter((s): s is Set<number> => s !== null);
    const quorum = Math.max(1, Math.ceil(members.length / 2));
    const result = scoreMatch(seeker, {
      slots: memberSlots.length
        ? groupSlots(memberSlots, Math.min(quorum, memberSlots.length))
        : null,
      styles: row.styles,
      goals: row.goals,
      modality: row.modality,
      sameSection: Boolean(mySection && row.section_number === mySection),
      capacity: row.capacity,
      seatsLeft,
    });
    groups.push({
      kind: "group",
      id: row.id,
      name: row.name,
      description: row.description,
      sectionNumber: row.section_number,
      memberCount: members.length,
      capacity: row.capacity,
      joinPolicy: row.join_policy,
      modality: row.modality,
      styles: row.styles,
      cadence: row.cadence,
      myStatus: row.my_status,
      members: members.map((m) => publicName(m.name)),
      score: result.score,
      windows: result.windows,
      reasons: result.reasons,
    });
  }
  groups.sort(
    (a, b) =>
      b.score - a.score ||
      b.windows - a.windows ||
      a.capacity - a.memberCount - (b.capacity - b.memberCount) ||
      a.id.localeCompare(b.id),
  );

  const peopleRows = await db.pool.query<
    MemberData & {
      section_number: string | null;
      styles: string[] | null;
      goals: string[] | null;
      modality: string | null;
      in_my_group: boolean;
      invited_to: string[] | null;
    }
  >(
    `select u.id, u.name, p.availability, p.styles, p.goals, p.modality, uc.section_number,
            (select json_agg(json_build_object('code', o.course_code, 'schedule', o.schedule))
               from user_courses o where o.user_id = u.id and o.term = $2) as schedules,
            exists (select 1 from group_members a join group_members b on b.group_id = a.group_id
                      join study_groups g on g.id = a.group_id
                     where a.user_id = $1 and b.user_id = u.id and a.status = 'active'
                       and b.status = 'active' and g.course_code = $3 and g.status = 'active') as in_my_group,
            (select array_agg(b.group_id) from group_members b join group_members a on a.group_id = b.group_id
               where b.user_id = u.id and b.status = 'invited' and a.user_id = $1 and a.status = 'active') as invited_to
       from user_courses uc
       join users u on u.id = uc.user_id
       left join study_profiles p on p.user_id = u.id
      where uc.course_code = $3 and uc.term = $2 and uc.user_id <> $1
        and u.account_status = 'active' and u.onboarding_completed_at is not null
        and coalesce(p.discoverable, true)
        and not exists (select 1 from match_dismissals d where d.user_id = $1
                         and d.target_type = 'user' and d.target_id = u.id)
      limit 200`,
    [userId, term, courseCode],
  );
  const people: PersonMatch[] = peopleRows.rows
    .map((row) => {
      const result = scoreMatch(seeker, {
        slots: toSlots(row),
        styles: row.styles ?? [],
        goals: row.goals ?? [],
        modality: row.modality ?? "either",
        sameSection: Boolean(mySection && row.section_number === mySection),
      });
      return {
        kind: "person" as const,
        id: row.id,
        name: publicName(row.name),
        sectionNumber: row.section_number,
        styles: row.styles ?? [],
        goals: row.goals ?? [],
        inMyGroup: row.in_my_group,
        invitedTo: row.invited_to ?? [],
        score: result.score,
        windows: result.windows,
        reasons: result.reasons,
      };
    })
    .sort(
      (a, b) =>
        b.score - a.score || b.windows - a.windows || a.id.localeCompare(b.id),
    )
    .slice(0, 30);

  return {
    groups,
    people,
    profileComplete: me.saved && me.availability.length > 0,
  };
}
