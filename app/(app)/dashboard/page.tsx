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
import { examTone } from "../ui/exam-bits";

export const metadata: Metadata = { title: "Home — Comet Study" };

export default async function DashboardPage() {
  const { db, user, term, termLabel, nebula } = await requireStudent();
  const now = new Date();
  const data = await loadDashboard(db, user.id, term, now);
  const first = (user.name ?? user.email.split("@")[0]).split(" ")[0];
  const next = data.sessions[0] ?? null;
  const today = campusDate(now);

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
      ...data.exams
        .filter((e) => campusDate(e.startsAt) === date)
        .map((e) => ({
          key: `e-${e.id}`,
          kind: "exam" as const,
          start: campusMinutes(e.startsAt),
          label: `${e.courseCode} ${e.label}`,
          detail: `${formatTimeRange(e.startsAt, e.endsAt ?? e.startsAt)}${e.location ? ` · ${e.location}` : ""}`,
          href: `/groups/${e.groupId}?tab=exams`,
        })),
    ];
    return { date, noon, items };
  });
  const weekSessions = data.sessions.filter(
    (s) => s.startsAt < new Date(now.getTime() + 7 * 86400000),
  ).length;
  const nextExam = data.exams[0];

  const summary = [
    weekSessions
      ? `${weekSessions} study ${weekSessions === 1 ? "session" : "sessions"} this week`
      : data.groups.length
        ? "No sessions on the books this week"
        : `${data.courses.length} ${data.courses.length === 1 ? "course" : "courses"} this term and no group yet — let’s fix that`,
    nextExam
      ? `${nextExam.courseCode} ${nextExam.label} ${relativeDay(nextExam.startsAt, now)}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <main id="main" className="app-page dashboard" tabIndex={-1}>
      <PageHeader
        kicker={`${formatLongDay(now)} · ${termLabel}`}
        title={`${greeting(now)},`}
        accent={`${first}.`}
        actions={
          <>
            <Link className="button ghost" href="/match">
              <Icon name="match" size={18} /> Find matches
            </Link>
            <Link className="button primary" href="/groups/new">
              <Icon name="plus" size={18} /> <span>New group</span>
            </Link>
          </>
        }
      >
        <p>{summary}.</p>
      </PageHeader>

      <div className="dash-grid">
        <Panel
          className="up-next span-2"
          title="Up next"
          icon="clock"
          id="up-next"
        >
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
                  {next.going} going{next.maybe ? `, ${next.maybe} maybe` : ""}
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
          className="span-2"
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
                            <span className="agenda-detail">{item.detail}</span>
                          </Link>
                        </li>
                      ))}
                  </ul>
                ) : (
                  <p className="agenda-free">Free day</p>
                )}
              </li>
            ))}
          </ol>
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

        <Panel
          className="span-3"
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
                  <Icon name="plus" size={26} />
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
          className="span-2"
          title="Your courses"
          icon="courses"
          id="courses"
          action={
            <Link className="text-link" href="/courses">
              Manage →
            </Link>
          }
        >
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
                <p className="course-row-people">
                  {course.classmates
                    ? `${course.classmates} ${course.classmates === 1 ? "classmate" : "classmates"} here`
                    : "No classmates yet"}
                </p>
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
                      : "Find a group"}{" "}
                    →
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Exams" icon="exam" id="exams">
          {data.exams.length ? (
            <ul className="exam-mini">
              {data.exams.slice(0, 5).map((exam) => (
                <li key={exam.id}>
                  <Link href={`/groups/${exam.groupId}?tab=exams`}>
                    <span className="exam-mini-date">
                      <strong>{formatDay(exam.startsAt).split(", ")[1]}</strong>
                      <span>{relativeDay(exam.startsAt, now)}</span>
                    </span>
                    <span className="exam-mini-body">
                      <strong>
                        {exam.courseCode} {exam.label}
                      </strong>
                      <Badge tone={examTone(exam.badge)}>
                        {exam.badge} · {exam.confirms}
                      </Badge>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty title="No exams tracked">
              Add exam dates inside a group; classmates confirm them so everyone
              trusts the date.
            </Empty>
          )}
        </Panel>

        <Panel
          className="span-3"
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
                    href={
                      resource.url ?? `/api/v1/resources/${resource.id}/file`
                    }
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
      </div>
    </main>
  );
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
