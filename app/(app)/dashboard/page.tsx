import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireStudent } from "@/lib/app-session";
import { parseSchedule } from "@/lib/calendar";
import { loadDashboard, type Action } from "@/lib/dashboard";
import { labelOf, RESOURCE_KINDS } from "@/lib/study-options";
import {
  addDays,
  campusDate,
  campusMinutes,
  campusToUtc,
  campusWeekday,
  formatClock,
  formatDay,
  formatLongDay,
  formatRange,
  formatTime,
  formatTimeRange,
  greeting,
  relativeDay,
} from "@/lib/time";
import {
  examStanceAction,
  joinGroupAction,
  leaveGroupAction,
} from "../actions";
import {
  Avatars,
  Badge,
  CourseTag,
  Empty,
  PageHeader,
  Panel,
  Seats,
} from "../ui/bits";
import { ActionForm, SubmitButton } from "../ui/forms";
import { Icon, type IconName } from "../ui/icons";
import { FreeRoomsNow, RoomsSkeleton } from "../ui/free-rooms";
import { RsvpControl, SessionCalendarLinks } from "../ui/session-bits";
import {
  campusExamDays,
  campusExamRelative,
  campusExamSource,
  campusExamWhen,
  examTone,
} from "../ui/exam-bits";

export const metadata: Metadata = { title: "Home — Comet Study" };

export default async function DashboardPage() {
  const { db, user, term, termLabel, nebula } = await requireStudent();
  const now = new Date();
  const data = await loadDashboard(db, user.id, term, now);
  const first = (user.name ?? user.email.split("@")[0]).split(" ")[0];
  const next = data.sessions[0] ?? null;
  const today = campusDate(now);

  // Exams classmates reported in groups and ones on UTD's schedule, soonest first.
  const upcomingExams = [
    ...data.exams.map((e) => {
      const time =
        e.endsAt && e.endsAt > e.startsAt
          ? formatTimeRange(e.startsAt, e.endsAt)
          : formatTime(e.startsAt);
      return {
        key: `e-${e.id}`,
        courseCode: e.courseCode,
        kind: e.kind,
        label: e.label,
        startsAt: e.startsAt,
        endsAt: e.endsAt,
        location: e.location,
        href: `/groups/${e.groupId}?tab=exams`,
        badge: { label: `${e.badge} · ${e.confirms}`, tone: examTone(e.badge) },
        days: [campusDate(e.startsAt)],
        when: time,
        // The line under an exam tile's countdown.
        tile: `${formatDay(e.startsAt)} · ${time}${e.location ? ` · ${e.location}` : ""}`,
        open: false,
      };
    }),
    ...data.campusExams.map((e) => ({
      key: `u-${e.id}`,
      courseCode: e.courseCode,
      kind: e.kind as string,
      label: e.label,
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      location: e.location,
      href: "/courses#exams",
      badge: campusExamSource(e),
      // A Testing Center exam shows on each day it can be taken.
      days: campusExamDays(e),
      // The badge already says Testing Center, so its tile skips the room.
      tile: e.allDay
        ? `${campusExamWhen(e)} · book a time`
        : `${formatRange(e.startsAt, e.endsAt)}${e.location ? ` · ${e.location}` : ""}`,
      when: e.allDay
        ? `${campusExamWhen(e)}, book a time`
        : formatTimeRange(e.startsAt, e.endsAt),
      open: campusExamRelative(e, now) === "open now",
    })),
  ].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  // The next seven days: classes (weekly), sessions and exams, per day.
  const classBlocks = data.courses.flatMap((c) =>
    parseSchedule(c.code, c.schedule),
  );
  const week = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i);
    const noon = campusToUtc(date, "12:00")!;
    const weekday = campusWeekday(noon);
    const items = [
      ...classBlocks
        .filter((b) => b.weekday === weekday)
        .map((b) => ({
          key: `c-${b.courseCode}-${b.start}`,
          kind: "class" as const,
          start: b.start,
          label: b.courseCode,
          detail: `${formatClock(b.start)}–${formatClock(b.end)}${b.where ? ` · ${b.where}` : ""}`,
          href: "/courses",
        })),
      ...data.sessions
        .filter((s) => campusDate(s.startsAt) === date)
        .map((s) => ({
          key: `s-${s.id}`,
          kind: "session" as const,
          start: campusMinutes(s.startsAt),
          label: s.title,
          detail: `${formatTimeRange(s.startsAt, s.endsAt)} · ${s.groupName}`,
          href: `/groups/${s.groupId}?tab=sessions`,
        })),
      ...upcomingExams
        .filter((e) => e.days.includes(date))
        .map((e) => ({
          key: e.key,
          kind: "exam" as const,
          start: e.days.length > 1 ? 0 : campusMinutes(e.startsAt),
          label: `${e.courseCode} ${e.label}`,
          detail: `${e.when}${e.location ? ` · ${e.location}` : ""}`,
          href: e.href,
        })),
    ];
    return { date, noon, items };
  });

  const coursesPanel = (
    <Panel
      title="Your courses"
      icon="courses"
      id="courses"
      action={
        <Link className="text-link" href="/courses">
          Manage →
        </Link>
      }
    >
      {data.courses.length ? (
        <ul className="course-rows">
          {data.courses.map((course) => (
            <li key={course.id} className="course-row">
              <div>
                <p className="course-row-code">
                  {course.code}
                  {course.sectionNumber ? (
                    <span>.{course.sectionNumber}</span>
                  ) : null}
                </p>
                <p className="course-row-title">{course.title}</p>
              </div>
              {course.groups.length ? (
                <Link
                  className="course-row-status in"
                  href={`/groups/${course.groups[0].id}`}
                >
                  <Icon name="check" size={16} /> {course.groups[0].name}
                </Link>
              ) : (
                <Link
                  className="course-row-status"
                  href={`/match?course=${encodeURIComponent(course.code)}`}
                >
                  {course.openGroups
                    ? `${course.openGroups} open ${course.openGroups === 1 ? "group" : "groups"}`
                    : course.classmates
                      ? `${course.classmates} ${course.classmates === 1 ? "classmate" : "classmates"}`
                      : "Find a group"}{" "}
                  →
                </Link>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <Empty
          title="No courses yet"
          action={{ href: "/courses", label: "Add your courses" }}
        >
          Your courses decide which classmates, groups and exams show up here.
        </Empty>
      )}
    </Panel>
  );
  const recentPanel = (
    <Panel
      title="Recently shared"
      icon="library"
      id="recent"
      action={
        <Link className="text-link" href="/library">
          Library →
        </Link>
      }
    >
      {data.resources.length ? (
        <ul className="resource-strip">
          {data.resources.map((resource) => (
            <li key={resource.id}>
              <a
                className="resource-chip"
                href={resource.url ?? `/api/v1/resources/${resource.id}/file`}
                {...(resource.url
                  ? {
                      target: "_blank",
                      rel: "noopener noreferrer nofollow",
                    }
                  : {})}
              >
                <Icon name={resource.url ? "link" : "file"} />
                <span>
                  <strong>{resource.title}</strong>
                  <span>
                    {labelOf(RESOURCE_KINDS, resource.kind)} ·{" "}
                    {resource.courseCode} ·{" "}
                    {relativeDay(resource.createdAt, now)}
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <Empty title="Nothing shared yet">
          Notes, guides and practice problems your groups upload land here.
        </Empty>
      )}
    </Panel>
  );
  const onSide = balanceColumns(data, week);

  return (
    <main id="main" className="app-page dashboard" tabIndex={-1}>
      <PageHeader
        kicker={`${formatLongDay(now)} · ${termLabel}`}
        title={`${greeting(now)},`}
        accent={`${first}.`}
        actions={
          <>
            <Link className="button ghost small" href="/match">
              <Icon name="match" size={16} /> Find matches
            </Link>
            <Link className="button primary small" href="/groups/new">
              <Icon name="plus" size={16} /> <span>New group</span>
            </Link>
          </>
        }
      />

      {/*
       * Exams lead the page as countdown tiles, after the 21st.dev "Stats
       * Card" grid (ravikatiyar162): a label row, one big figure and a quiet
       * line under it. The nearest exam gets a double-width tile.
       */}
      <section className="dash-exams" id="exams" aria-labelledby="exams-title">
        <div className="dash-exams-head">
          <h2 id="exams-title">
            <Icon name="exam" size={18} /> Exams
          </h2>
          <Link className="text-link" href="/courses#exams">
            All exams →
          </Link>
        </div>
        {upcomingExams.length ? (
          <ol className="exam-tiles">
            {upcomingExams.slice(0, 5).map((exam, index) => {
              const count = countdown(exam.startsAt, now, exam.open);
              return (
                <li
                  key={exam.key}
                  className={`exam-tile kind-${exam.kind}${index === 0 ? " is-next" : ""}`}
                >
                  <Link href={exam.href}>
                    <span className="exam-tile-top">
                      <span className="exam-tile-course">
                        {exam.courseCode}
                      </span>
                      {index === 0 ? (
                        <span className="xs-next">
                          <i aria-hidden="true" /> Next
                        </span>
                      ) : (
                        <Icon name="exam" size={15} />
                      )}
                    </span>
                    <span
                      className={`exam-tile-count${count.unit ? "" : " is-word"}`}
                    >
                      <strong>{count.value}</strong>
                      {count.unit ? <span> {count.unit}</span> : null}
                    </span>
                    <span className="exam-tile-label">{exam.label}</span>
                    <span className="exam-tile-when">{exam.tile}</span>
                    <Badge tone={exam.badge.tone}>{exam.badge.label}</Badge>
                  </Link>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="dash-exams-empty">
            No exams tracked yet.{" "}
            <Link className="text-link" href="/courses#exams">
              Add your sections
            </Link>{" "}
            to see your registrar finals, or add dates inside a group so
            classmates can confirm them.
          </p>
        )}
      </section>

      <div className="dash-body">
        <div className="dash-col">
          <Panel className="up-next" title="Up next" icon="clock" id="up-next">
            {next ? (
              <article className="next-card">
                <div className="next-when">
                  <span className="next-rel">
                    {relativeDay(next.startsAt, now)}
                  </span>
                  <span className="next-day">{formatDay(next.startsAt)}</span>
                  <strong>{formatTimeRange(next.startsAt, next.endsAt)}</strong>
                </div>
                <div className="next-body">
                  <p className="next-meta">
                    <CourseTag code={next.courseCode} /> {next.groupName}
                  </p>
                  <h3>
                    <Link href={`/groups/${next.groupId}?tab=sessions`}>
                      {next.title}
                    </Link>
                  </h3>
                  <p className="next-where">
                    <Icon name="pin" size={16} />{" "}
                    {next.location ?? "Location to be decided"}
                    <span className="dot" aria-hidden="true">
                      ·
                    </span>
                    {next.going} going
                    {next.maybe ? `, ${next.maybe} maybe` : ""}
                  </p>
                  <div className="next-actions">
                    <RsvpControl sessionId={next.id} current={next.myRsvp} />
                    <SessionCalendarLinks session={next} />
                  </div>
                </div>
              </article>
            ) : (
              <Empty
                title={
                  data.groups.length
                    ? "Nothing scheduled yet"
                    : "Your first session starts with a group"
                }
                action={
                  data.groups.length
                    ? {
                        href: `/groups/${data.groups[0].id}?tab=sessions`,
                        label: "Schedule a session",
                      }
                    : { href: "/match", label: "Find classmates" }
                }
              >
                {data.groups.length
                  ? "Pick a time that works and your group can RSVP right here."
                  : "Join or start a group for one of your courses, then plan a time to meet."}
              </Empty>
            )}
          </Panel>

          <Panel
            title="Next 7 days"
            icon="calendar"
            id="week"
            action={
              <Link className="text-link" href="/calendar">
                Open calendar →
              </Link>
            }
          >
            <ol className="agenda">
              {week.map((day) => (
                <li
                  key={day.date}
                  className={`agenda-day${day.items.length ? "" : " is-empty"}`}
                >
                  <p className="agenda-date">
                    <strong>
                      {day.date === today
                        ? "Today"
                        : formatDay(day.noon).split(",")[0]}
                    </strong>
                    <span>{formatDay(day.noon).split(", ")[1]}</span>
                  </p>
                  {day.items.length ? (
                    <ul>
                      {day.items
                        .sort((a, b) => a.start - b.start)
                        .map((item) => (
                          <li
                            key={item.key}
                            className={`agenda-item kind-${item.kind}`}
                          >
                            <Link href={item.href}>
                              <span className="agenda-label">{item.label}</span>
                              <span className="agenda-detail">
                                {item.detail}
                              </span>
                            </Link>
                          </li>
                        ))}
                    </ul>
                  ) : (
                    <p className="agenda-free">Free</p>
                  )}
                </li>
              ))}
            </ol>
          </Panel>

          {onSide.has("courses") ? null : coursesPanel}
          {onSide.has("recent") ? null : recentPanel}
        </div>

        <div className="dash-col">
          <Panel
            title="Needs you"
            icon="bell"
            id="needs-you"
            className="needs-you"
          >
            {data.actions.length ? (
              <ul className="item-group">
                {data.actions.map((action, index) => (
                  <ActionItem key={index} action={action} now={now} />
                ))}
              </ul>
            ) : (
              <Empty title="You’re all caught up">
                Invitations, requests and RSVPs show up here.
              </Empty>
            )}
          </Panel>

          <Panel
            title="Your groups"
            icon="groups"
            id="my-groups"
            action={
              <Link className="text-link" href="/groups">
                All groups →
              </Link>
            }
          >
            {data.groups.length ? (
              <ul className="group-cards">
                {data.groups.map((group) => (
                  <li key={group.id}>
                    <Link className="group-card" href={`/groups/${group.id}`}>
                      <div className="group-card-top">
                        <CourseTag code={group.courseCode} />
                        {group.myRole === "owner" ? (
                          <Badge tone="info">Organizer</Badge>
                        ) : null}
                      </div>
                      <h3>{group.name}</h3>
                      <p className="group-card-next">
                        {group.nextSession
                          ? `Next: ${formatRange(group.nextSession.startsAt, group.nextSession.endsAt)}`
                          : "No session scheduled"}
                      </p>
                      <div className="group-card-foot">
                        <Avatars
                          names={group.members.map((m) => m.name)}
                          total={group.memberCount}
                        />
                        <Seats
                          count={group.memberCount}
                          capacity={group.capacity}
                        />
                      </div>
                    </Link>
                  </li>
                ))}
                <li>
                  <Link className="group-card new" href="/groups/new">
                    <Icon name="plus" size={22} />
                    <span>Start a group</span>
                  </Link>
                </li>
              </ul>
            ) : (
              <Empty
                title="No groups yet"
                action={{
                  href: "/groups",
                  label: "Browse groups in your courses",
                }}
              >
                Groups are 4–8 classmates from the same course. Join an open one
                or start your own.
              </Empty>
            )}
          </Panel>

          <Panel
            title="Free rooms now"
            icon="rooms"
            id="rooms-now"
            action={
              <Link className="text-link" href="/rooms">
                Search →
              </Link>
            }
          >
            <Suspense fallback={<RoomsSkeleton />}>
              <FreeRoomsNow nebula={nebula} now={now} />
            </Suspense>
          </Panel>
          {onSide.has("courses") ? coursesPanel : null}
          {onSide.has("recent") ? recentPanel : null}
        </div>
      </div>
    </main>
  );
}

/** The big figure on an exam tile: "4 days", "Tomorrow", "Today" or "Open now". */
function countdown(startsAt: Date, now: Date, open: boolean) {
  if (open) return { value: "Open", unit: "now" };
  const days = Math.round(
    (Date.parse(campusDate(startsAt)) - Date.parse(campusDate(now))) / 86400000,
  );
  if (days <= 0) return { value: "Today", unit: "" };
  if (days === 1) return { value: "Tomorrow", unit: "" };
  return { value: String(days), unit: "days" };
}

type Movable = "courses" | "recent";

/*
 * The columns stack independently, so courses and shared files go on
 * whichever side keeps the two closest to even. Heights are rough desktop
 * pixels from item counts: a panel's padding and title come to about 92px,
 * panels sit 20px apart, and the side column is one card wide.
 */
function balanceColumns(
  data: Awaited<ReturnType<typeof loadDashboard>>,
  week: { items: unknown[] }[],
) {
  const EMPTY = 150;
  const panel = (body: number) => 92 + body;
  const stack = (count: number, each: number, gap: number) =>
    count ? count * each + (count - 1) * gap : 0;
  const size = (count: number, each: number, gap: number) => ({
    main: panel(count ? stack(Math.ceil(count / 2), each, gap) : EMPTY),
    side: panel(count ? stack(count, each, gap) : EMPTY),
  });
  const sizes: Record<Movable, { main: number; side: number }> = {
    courses: {
      ...size(data.courses.length, 95, 8),
      // One row per course on the side.
      side: panel(
        data.courses.length ? stack(data.courses.length, 70, 8) : EMPTY,
      ),
    },
    recent: size(data.resources.length, 71, 10),
  };
  const action = (a: Action) =>
    a.kind === "rsvp"
      ? 131
      : a.kind === "invite"
        ? 120
        : a.kind === "exam"
          ? 106
          : a.kind === "find-groups"
            ? 72 + 33 * Math.ceil(a.courses.length / 3)
            : 64;
  const main =
    245 +
    20 +
    panel(
      week.reduce(
        (sum, day) =>
          sum + (day.items.length ? 18 + 45 * day.items.length : 36),
        0,
      ),
    );
  const side =
    panel(
      data.actions.length
        ? data.actions.reduce((sum, a) => sum + action(a), 0)
        : EMPTY,
    ) +
    20 +
    // Group cards, then the slim "Start a group" row.
    panel(data.groups.length ? data.groups.length * 182 + 50 : EMPTY) +
    20 +
    350;

  const keys: Movable[] = ["courses", "recent"];
  const gap = (onSide: Set<Movable>) => {
    let left = main;
    let right = side;
    for (const key of keys) {
      if (onSide.has(key)) right += 20 + sizes[key].side;
      else left += 20 + sizes[key].main;
    }
    return Math.abs(left - right);
  };
  let best = new Set<Movable>(["recent"]);
  for (let mask = 0; mask < 4; mask++) {
    const onSide = new Set(keys.filter((_, i) => mask & (1 << i)));
    if (gap(onSide) < gap(best)) best = onSide;
  }
  return best;
}

/*
 * "Needs you" rows follow the 21st.dev "The Item One" notification items: an
 * icon tile, a title with an unread dot, one line of detail and a quiet
 * right-hand meta; rows join into one outlined stack. Rows that only lead
 * somewhere are links; rows that need an answer carry their buttons.
 */
function Row({
  icon,
  title,
  detail,
  meta,
  unread = false,
  href,
  children,
}: {
  icon: IconName;
  title: React.ReactNode;
  detail?: React.ReactNode;
  meta?: React.ReactNode;
  unread?: boolean;
  href?: string;
  children?: React.ReactNode;
}) {
  const body = (
    <>
      <span className="item-media" aria-hidden="true">
        <Icon name={icon} size={17} />
      </span>
      <span className="item-content">
        <span className="item-title">
          {title}
          {unread ? (
            <span className="item-dot" aria-label="Needs a reply" />
          ) : null}
        </span>
        {detail ? <span className="item-detail">{detail}</span> : null}
      </span>
      {meta ? <span className="item-meta">{meta}</span> : null}
      {href ? <Icon name="chevronRight" size={16} className="item-go" /> : null}
    </>
  );
  return (
    <li className="item">
      {href ? (
        <Link className="item-row" href={href}>
          {body}
        </Link>
      ) : (
        <div className="item-row">{body}</div>
      )}
      {children ? <div className="item-footer">{children}</div> : null}
    </li>
  );
}

function ActionItem({ action, now }: { action: Action; now: Date }) {
  switch (action.kind) {
    case "invite":
      return (
        <Row
          icon="groups"
          unread
          title={`Invite to ${action.groupName}`}
          detail={`${action.courseCode} · a classmate added you`}
        >
          <ActionForm
            action={joinGroupAction}
            hidden={{ groupId: action.groupId }}
          >
            <SubmitButton
              className="button primary small"
              pendingLabel="Joining…"
            >
              Accept
            </SubmitButton>
          </ActionForm>
          <ActionForm
            action={leaveGroupAction}
            hidden={{ groupId: action.groupId }}
          >
            <SubmitButton className="button ghost small">Decline</SubmitButton>
          </ActionForm>
        </Row>
      );
    case "request":
      return (
        <Row
          icon="bell"
          unread
          title={`${action.count} asking to join`}
          detail={action.groupName}
          href={`/groups/${action.groupId}?tab=members`}
        />
      );
    case "rsvp":
      return (
        <Row
          icon="calendar"
          unread
          title={action.title}
          detail={`${action.groupName} · ${formatRange(action.startsAt, action.endsAt)}`}
          meta={relativeDay(action.startsAt, now)}
        >
          <RsvpControl sessionId={action.sessionId} current={null} compact />
        </Row>
      );
    case "exam":
      return (
        <Row
          icon="exam"
          unread
          title={`Is ${action.courseCode} ${action.label} right?`}
          detail={`${formatDay(action.startsAt)} · a classmate reported it`}
          meta={relativeDay(action.startsAt, now)}
        >
          <ActionForm
            action={examStanceAction}
            hidden={{ examId: action.examId }}
            className="stance"
          >
            <SubmitButton className="rsvp-option" name="stance" value="confirm">
              <Icon name="check" size={14} /> Confirm
            </SubmitButton>
            <SubmitButton className="rsvp-option" name="stance" value="dispute">
              <Icon name="x" size={14} /> Dispute
            </SubmitButton>
          </ActionForm>
        </Row>
      );
    case "find-groups":
      return (
        <Row
          icon="search"
          title={
            action.courses.length === 1
              ? `Find a group for ${action.courses[0].code}`
              : `${action.courses.length} courses without a group`
          }
          detail={
            action.courses.some((c) => c.openGroups)
              ? `${action.courses.reduce((n, c) => n + c.openGroups, 0)} open groups to look at`
              : "Start one and invite classmates"
          }
        >
          <span className="item-chips">
            {action.courses.map((course) => (
              <Link
                key={course.code}
                className="chip-link"
                href={`/match?course=${encodeURIComponent(course.code)}`}
              >
                {course.code}
                {course.openGroups ? (
                  <span className="chip-count">{course.openGroups}</span>
                ) : null}
              </Link>
            ))}
          </span>
        </Row>
      );
    case "availability":
      return (
        <Row
          icon="clock"
          title="Add when you’re free"
          detail="Matches rank by overlapping hours"
          href="/profile"
        />
      );
    case "first-session":
      return (
        <Row
          icon="plus"
          title="Plan the next meetup"
          detail={action.groupName}
          href={`/groups/${action.groupId}?tab=sessions`}
        />
      );
  }
}
