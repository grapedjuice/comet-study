import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isUuid } from "@/lib/app-errors";
import { requireStudent } from "@/lib/app-session";
import {
  getGroup,
  listActivity,
  listInvitable,
  listMembers,
  type GroupSummary,
} from "@/lib/groups";
import { listResources } from "@/lib/resources";
import { listCourseCampusExams } from "@/lib/campus-exams";
import { listGroupExams, listGroupSessions } from "@/lib/sessions";
import {
  EXAM_KINDS,
  GROUP_MODALITIES,
  labelOf,
  STUDY_GOALS,
  STUDY_STYLES,
} from "@/lib/study-options";
import {
  addDays,
  campusDate,
  formatDay,
  formatRange,
  formatTimeRange,
  isDateString,
  relativeDay,
  TZ_LABEL,
} from "@/lib/time";
import {
  answerRequestAction,
  archiveGroupAction,
  cancelSessionAction,
  createExamAction,
  createSessionAction,
  deleteExamAction,
  examStanceAction,
  inviteAction,
  joinGroupAction,
  leaveGroupAction,
  removeMemberAction,
  transferOwnerAction,
} from "../../actions";
import { Avatars, Badge, CourseTag, Empty, Panel, Seats } from "../../ui/bits";
import { RoomCombobox } from "../../ui/room-combobox";
import {
  CampusExamItems,
  campusExamRelative,
  campusExamSource,
  examTone,
} from "../../ui/exam-bits";
import { ActionForm, ConfirmSubmit, SubmitButton } from "../../ui/forms";
import { GlassSelect } from "../../ui/glass-select";
import { Icon } from "../../ui/icons";
import { SmoothInput, SmoothTextarea } from "../../../ui/smooth-input";
import { ResourceForm } from "../../ui/resource-form";
import { ResourceList } from "../../ui/resource-list";
import { RsvpControl, SessionCalendarLinks } from "../../ui/session-bits";
import { GroupForm } from "../group-form";

export const metadata: Metadata = { title: "Group — Comet Study" };

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "sessions", label: "Sessions" },
  { id: "library", label: "Library" },
  { id: "exams", label: "Exams" },
  { id: "members", label: "Members" },
  { id: "settings", label: "Settings" },
] as const;
type Tab = (typeof TABS)[number]["id"];

type Search = {
  tab?: string;
  created?: string;
  room?: string;
  date?: string;
  start?: string;
  end?: string;
};

export default async function GroupPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Search>;
}) {
  const [{ id }, search] = await Promise.all([params, searchParams]);
  if (!isUuid(id)) notFound();
  const { db, user } = await requireStudent();
  const group = await getGroup(db, user.id, id);
  if (!group || (group.status === "archived" && group.myStatus !== "active"))
    notFound();

  if (group.myStatus !== "active") return <GroupPreview group={group} />;

  const tab: Tab = TABS.some((t) => t.id === search.tab)
    ? (search.tab as Tab)
    : "overview";
  const owner = group.myRole === "owner";
  const [
    members,
    sessions,
    exams,
    campusExams,
    resources,
    activity,
    invitable,
  ] = await Promise.all([
    listMembers(db, id),
    listGroupSessions(db, user.id, id),
    listGroupExams(db, user.id, id),
    listCourseCampusExams(
      db,
      group.courseCode,
      group.term,
      group.sectionNumber,
    ),
    listResources(db, user.id, { groupId: id }, tab === "library" ? 60 : 4),
    listActivity(db, id, 12),
    tab === "members" ? listInvitable(db, id) : Promise.resolve([]),
  ]);
  const now = new Date();
  const upcoming = sessions.filter(
    (s) => s.endsAt > now && s.status === "scheduled",
  );
  const past = sessions.filter(
    (s) => s.endsAt <= now || s.status === "cancelled",
  );
  // Classmate-reported exams and ones on UTD's schedule, soonest first.
  const upcomingExams = [
    ...exams
      .filter((e) => e.startsAt > now)
      .map((e) => ({
        key: e.id,
        label: e.label,
        startsAt: e.startsAt,
        relative: relativeDay(e.startsAt, now),
        badge: { label: `${e.badge} · ${e.confirms}`, tone: examTone(e.badge) },
      })),
    ...campusExams
      .filter((e) => e.endsAt > now)
      .map((e) => ({
        key: `u-${e.id}`,
        label: e.label,
        startsAt: e.startsAt,
        relative: campusExamRelative(e, now),
        badge: campusExamSource(e),
      })),
  ].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const active = members.filter((m) => m.status === "active");
  const pending = members.filter((m) => m.status === "pending");
  const invited = members.filter((m) => m.status === "invited");

  return (
    <main id="main" className="app-page group-page" tabIndex={-1}>
      <header className="group-hero">
        <div className="group-hero-top">
          <Link className="back-link" href="/groups">
            ← Groups
          </Link>
          <div className="group-badges">
            <CourseTag code={group.courseCode} />
            {group.sectionNumber ? (
              <Badge>Section {group.sectionNumber}</Badge>
            ) : null}
            <Badge>{labelOf(GROUP_MODALITIES, group.modality)}</Badge>
            <Badge tone={group.joinPolicy === "open" ? "good" : "neutral"}>
              {group.joinPolicy === "open"
                ? "Open to classmates"
                : "Approval to join"}
            </Badge>
            {group.status === "archived" ? (
              <Badge tone="warn">Archived</Badge>
            ) : null}
          </div>
        </div>
        <h1>{group.name}</h1>
        <p className="group-hero-sub">
          {group.courseTitle}
          {group.cadence ? ` · ${group.cadence}` : ""}
        </p>
        {group.description ? (
          <p className="group-hero-desc">{group.description}</p>
        ) : null}
        <div className="group-hero-foot">
          <Avatars
            names={active.map((m) => m.name)}
            total={active.length}
            max={6}
          />
          <span className="seat-count">
            <Seats count={active.length} capacity={group.capacity} />{" "}
            {active.length}/{group.capacity} members
          </span>
          {search.created ? (
            <Badge tone="good">
              Group created — invite classmates from Members
            </Badge>
          ) : null}
        </div>
      </header>

      <nav className="tabs" aria-label="Group sections">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`/groups/${id}${t.id === "overview" ? "" : `?tab=${t.id}`}`}
            className={`tab${tab === t.id ? " is-on" : ""}`}
            aria-current={tab === t.id ? "page" : undefined}
            scroll={false}
          >
            {t.label}
            {t.id === "members" && owner && pending.length ? (
              <span className="tab-count">{pending.length}</span>
            ) : null}
            {t.id === "sessions" && upcoming.length ? (
              <span className="tab-count soft">{upcoming.length}</span>
            ) : null}
          </Link>
        ))}
      </nav>

      {tab === "overview" ? (
        <div className="split">
          <div className="split-main">
            <Panel
              title="Next session"
              icon="clock"
              id="next"
              action={
                <Link className="text-link" href={`/groups/${id}?tab=sessions`}>
                  Schedule →
                </Link>
              }
            >
              {upcoming[0] ? (
                <SessionCard
                  session={upcoming[0]}
                  userId={user.id}
                  owner={owner}
                  now={now}
                />
              ) : (
                <Empty
                  title="Nothing scheduled"
                  action={{
                    href: `/groups/${id}?tab=sessions`,
                    label: "Pick a time",
                  }}
                >
                  Propose a time and members RSVP from their dashboards.
                </Empty>
              )}
            </Panel>
            <Panel
              title="Upcoming exams"
              icon="exam"
              id="ov-exams"
              action={
                <Link className="text-link" href={`/groups/${id}?tab=exams`}>
                  All →
                </Link>
              }
            >
              {upcomingExams.length ? (
                <ul className="exam-mini">
                  {upcomingExams.slice(0, 3).map((exam) => (
                    <li key={exam.key}>
                      <Link href={`/groups/${id}?tab=exams`}>
                        <span className="exam-mini-date">
                          <strong>
                            {formatDay(exam.startsAt).split(", ")[1]}
                          </strong>
                          <span>{exam.relative}</span>
                        </span>
                        <span className="exam-mini-body">
                          <strong>{exam.label}</strong>
                          <Badge tone={exam.badge.tone}>
                            {exam.badge.label}
                          </Badge>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty title="No exams added">
                  Add the midterm date once; the group confirms it.
                </Empty>
              )}
            </Panel>
            <Panel
              title="Latest in the library"
              icon="library"
              id="ov-lib"
              action={
                <Link className="text-link" href={`/groups/${id}?tab=library`}>
                  Library →
                </Link>
              }
            >
              {resources.length ? (
                <ResourceList
                  resources={resources}
                  userId={user.id}
                  ownerOf={new Set(owner ? [id] : [])}
                />
              ) : (
                <Empty
                  title="Nothing shared yet"
                  action={{
                    href: `/groups/${id}?tab=library`,
                    label: "Share something",
                  }}
                />
              )}
            </Panel>
          </div>
          <aside className="split-side">
            <Panel title="Members" icon="groups" id="ov-members">
              <ul className="member-mini">
                {active.map((m, i) => (
                  <li key={m.id}>
                    <span className={`avatar tone-${i % 4}`} aria-hidden="true">
                      {m.name
                        .split(" ")
                        .map((p) => p[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase()}
                    </span>
                    <span>
                      <strong>{m.name}</strong>
                      <span>
                        {m.role === "owner"
                          ? "Organizer"
                          : `${m.sessionsAttended} sessions`}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel title="Activity" icon="spark" id="activity">
              {activity.length ? (
                <ol className="activity">
                  {activity.map((a) => (
                    <li key={a.id}>
                      <p>{a.summary}</p>
                      <time dateTime={a.createdAt.toISOString()}>
                        {relativeDay(a.createdAt, now)}
                      </time>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="muted-note">Nothing yet.</p>
              )}
            </Panel>
          </aside>
        </div>
      ) : null}

      {tab === "sessions" ? (
        <div className="split">
          <div className="split-main">
            <Panel title="Upcoming" icon="calendar" id="upcoming">
              {upcoming.length ? (
                <ul className="session-list">
                  {upcoming.map((s) => (
                    <li key={s.id}>
                      <SessionCard
                        session={s}
                        userId={user.id}
                        owner={owner}
                        now={now}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty title="No sessions yet">
                  Use the form to put the first one on everyone’s calendar.
                </Empty>
              )}
            </Panel>
            {past.length ? (
              <Panel title="Recent" id="past">
                <ul className="past-list">
                  {past.map((s) => (
                    <li
                      key={s.id}
                      className={s.status === "cancelled" ? "is-cancelled" : ""}
                    >
                      <strong>{s.title}</strong>
                      <span>
                        {formatRange(s.startsAt, s.endsAt)} ·{" "}
                        {s.status === "cancelled"
                          ? "Cancelled"
                          : `${s.going} went`}
                      </span>
                    </li>
                  ))}
                </ul>
              </Panel>
            ) : null}
          </div>
          <aside className="split-side">
            <Panel title="Schedule a session" icon="plus" id="schedule">
              <SessionForm groupId={id} search={search} />
            </Panel>
          </aside>
        </div>
      ) : null}

      {tab === "library" ? (
        <div className="split">
          <div className="split-main">
            <Panel title="Shared with the group" icon="library" id="lib">
              {resources.length ? (
                <ResourceList
                  resources={resources}
                  userId={user.id}
                  ownerOf={new Set(owner ? [id] : [])}
                />
              ) : (
                <Empty title="The shelf is empty">
                  Notes, study guides, practice problems, useful links — share
                  the first one.
                </Empty>
              )}
            </Panel>
          </div>
          <aside className="split-side">
            <Panel title="Share" icon="upload" id="share">
              <ResourceForm groupId={id} />
            </Panel>
          </aside>
        </div>
      ) : null}

      {tab === "exams" ? (
        <div className="split">
          <div className="split-main">
            {campusExams.length || !group.sectionNumber ? (
              <Panel
                title="On UTD’s schedule"
                icon="calendar"
                id="campus-exams"
              >
                {campusExams.length ? (
                  <CampusExamItems
                    exams={campusExams}
                    now={now}
                    showCourse={false}
                  />
                ) : null}
                <p className="fine-print">
                  {group.sectionNumber
                    ? "Finals come from the UT Dallas registrar; check Orion the week before finals in case the room changes. Testing Center exams are taken on one of the listed days; book a time on RegisterBlast. “Room booked” exams are rooms a department reserved, and your instructor has the final word."
                    : "This group isn’t tied to one section, so only course-wide exams show here. Each member sees their section’s final on their Courses page."}
                </p>
              </Panel>
            ) : null}
            <Panel title="Exam dates" icon="exam" id="exam-list">
              {exams.length ? (
                <ul className="exam-list">
                  {exams.map((exam) => (
                    <li
                      key={exam.id}
                      className={`exam-item${exam.startsAt < now ? " is-past" : ""}`}
                    >
                      <div className="exam-date-block">
                        <span>{formatDay(exam.startsAt).split(", ")[0]}</span>
                        <strong>
                          {formatDay(exam.startsAt).split(", ")[1]}
                        </strong>
                      </div>
                      <div className="exam-body">
                        <p className="exam-title">
                          {exam.label}{" "}
                          <Badge>{labelOf(EXAM_KINDS, exam.kind)}</Badge>
                        </p>
                        <p className="exam-meta">
                          {formatTimeRange(
                            exam.startsAt,
                            exam.endsAt ?? exam.startsAt,
                          )}
                          {exam.location ? ` · ${exam.location}` : ""} ·{" "}
                          {relativeDay(exam.startsAt, now)}
                        </p>
                        <p className="exam-confidence">
                          <Badge tone={examTone(exam.badge)}>
                            {exam.badge}
                          </Badge>
                          <span>
                            {exam.confirms} confirmed
                            {exam.disputes
                              ? ` · ${exam.disputes} disputed`
                              : ""}
                          </span>
                        </p>
                      </div>
                      <div className="exam-actions">
                        <ActionForm
                          action={examStanceAction}
                          hidden={{ examId: exam.id }}
                          className="stance"
                        >
                          <SubmitButton
                            className={`rsvp-option${exam.myStance === "confirm" ? " is-on rsvp-going" : ""}`}
                            name="stance"
                            value={
                              exam.myStance === "confirm" ? "clear" : "confirm"
                            }
                          >
                            <Icon name="check" size={15} /> Confirm
                          </SubmitButton>
                          <SubmitButton
                            className={`rsvp-option${exam.myStance === "dispute" ? " is-on rsvp-not_going" : ""}`}
                            name="stance"
                            value={
                              exam.myStance === "dispute" ? "clear" : "dispute"
                            }
                          >
                            <Icon name="x" size={15} /> Dispute
                          </SubmitButton>
                        </ActionForm>
                        {owner || exam.createdBy === user.id ? (
                          <ActionForm
                            action={deleteExamAction}
                            hidden={{ examId: exam.id }}
                          >
                            <ConfirmSubmit
                              className="text-button"
                              prompt="Remove this exam?"
                              confirmLabel="Remove"
                            >
                              Remove
                            </ConfirmSubmit>
                          </ActionForm>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty title="No exams yet">
                  Add the dates from your syllabus so the group can plan around
                  them.
                </Empty>
              )}
              <p className="fine-print">
                Dates are reported by classmates, not the university. Confidence
                grows as members confirm; any dispute flags it.
              </p>
            </Panel>
          </div>
          <aside className="split-side">
            <Panel title="Add an exam" icon="plus" id="add-exam">
              <ActionForm
                action={createExamAction}
                hidden={{ groupId: id }}
                className="stack-form"
                resetOnSuccess
              >
                <div className="form-row">
                  <GlassSelect
                    label="Type"
                    name="kind"
                    defaultValue="midterm"
                    options={EXAM_KINDS.map((k) => ({
                      value: k.id,
                      label: k.label,
                    }))}
                  />
                  <label className="form-field grow">
                    <span className="field-label">Name</span>
                    <SmoothInput
                      className="field"
                      name="label"
                      required
                      maxLength={60}
                      placeholder="Midterm 1"
                    />
                  </label>
                </div>
                <label className="form-field">
                  <span className="field-label">Date</span>
                  <input
                    className="field"
                    type="date"
                    name="date"
                    required
                    min={campusDate(now)}
                  />
                </label>
                <div className="form-row">
                  <label className="form-field">
                    <span className="field-label">Starts</span>
                    <input
                      className="field"
                      type="time"
                      name="start"
                      required
                      defaultValue="10:00"
                    />
                  </label>
                  <label className="form-field">
                    <span className="field-label">
                      Ends <em>optional</em>
                    </span>
                    <input className="field" type="time" name="end" />
                  </label>
                </div>
                <label className="form-field">
                  <span className="field-label">
                    Room <em>optional</em>
                  </span>
                  <RoomCombobox
                    name="location"
                    maxLength={80}
                    placeholder="SLC 1.102"
                  />
                </label>
                <p className="fine-print">Times are {TZ_LABEL}.</p>
                <div className="form-actions">
                  <SubmitButton pendingLabel="Adding…">Add exam</SubmitButton>
                </div>
              </ActionForm>
            </Panel>
          </aside>
        </div>
      ) : null}

      {tab === "members" ? (
        <div className="split">
          <div className="split-main">
            {owner && pending.length ? (
              <Panel title="Asking to join" icon="bell" id="requests">
                <ul className="list-rows">
                  {pending.map((m) => (
                    <li key={m.id} className="list-row">
                      <p className="row-title">{m.name}</p>
                      <ActionForm
                        action={answerRequestAction}
                        hidden={{ groupId: id, userId: m.id }}
                        className="row-actions"
                      >
                        <SubmitButton
                          className="button primary small"
                          name="decision"
                          value="approve"
                          disabled={active.length >= group.capacity}
                        >
                          Approve
                        </SubmitButton>
                        <SubmitButton
                          className="button ghost small"
                          name="decision"
                          value="decline"
                        >
                          Decline
                        </SubmitButton>
                      </ActionForm>
                    </li>
                  ))}
                </ul>
              </Panel>
            ) : null}
            <Panel
              title={`Members · ${active.length}/${group.capacity}`}
              icon="groups"
              id="roster"
            >
              <ul className="list-rows">
                {active.map((m) => (
                  <li key={m.id} className="list-row">
                    <div>
                      <p className="row-title">
                        {m.name}{" "}
                        {m.id === user.id ? (
                          <span className="you">you</span>
                        ) : null}
                        {m.role === "owner" ? (
                          <Badge tone="info">Organizer</Badge>
                        ) : null}
                      </p>
                      <p className="row-sub">
                        {m.email} · {m.sessionsAttended}{" "}
                        {m.sessionsAttended === 1 ? "session" : "sessions"}{" "}
                        attended
                        {m.joinedAt ? ` · joined ${formatDay(m.joinedAt)}` : ""}
                      </p>
                    </div>
                    {owner && m.id !== user.id ? (
                      <div className="row-actions">
                        <ActionForm
                          action={transferOwnerAction}
                          hidden={{ groupId: id, userId: m.id }}
                        >
                          <ConfirmSubmit
                            className="text-button"
                            prompt={`Make ${m.name.split(" ")[0]} organizer?`}
                            confirmLabel="Hand over"
                          >
                            Make organizer
                          </ConfirmSubmit>
                        </ActionForm>
                        <ActionForm
                          action={removeMemberAction}
                          hidden={{ groupId: id, userId: m.id }}
                        >
                          <ConfirmSubmit
                            className="text-button danger"
                            prompt={`Remove ${m.name.split(" ")[0]}?`}
                            confirmLabel="Remove"
                          >
                            Remove
                          </ConfirmSubmit>
                        </ActionForm>
                      </div>
                    ) : null}
                  </li>
                ))}
                {invited.map((m) => (
                  <li key={m.id} className="list-row is-invited">
                    <p className="row-title">
                      {m.name} <Badge tone="warn">Invited</Badge>
                    </p>
                    {owner ? (
                      <ActionForm
                        action={removeMemberAction}
                        hidden={{ groupId: id, userId: m.id }}
                      >
                        <SubmitButton className="text-button">
                          Cancel invite
                        </SubmitButton>
                      </ActionForm>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
          <aside className="split-side">
            <Panel
              title="Invite classmates"
              icon="plus"
              id="invite"
              action={
                <Link
                  className="text-link"
                  href={`/match?course=${encodeURIComponent(group.courseCode)}`}
                >
                  Best matches →
                </Link>
              }
            >
              {active.length >= group.capacity ? (
                <p className="muted-note">
                  The group is full. Raise the size in Settings to invite more.
                </p>
              ) : invitable.length ? (
                <ul className="invite-list">
                  {invitable.map((c) => (
                    <li key={c.id}>
                      <span>
                        <strong>{c.name}</strong>
                        <span>
                          {c.sameSection
                            ? "Same section"
                            : c.sectionNumber
                              ? `Section ${c.sectionNumber}`
                              : group.courseCode}
                        </span>
                      </span>
                      <ActionForm
                        action={inviteAction}
                        hidden={{ groupId: id, userId: c.id }}
                      >
                        <SubmitButton
                          className="button ghost small"
                          pendingLabel="…"
                        >
                          Invite
                        </SubmitButton>
                      </ActionForm>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted-note">
                  No other {group.courseCode} students are on Comet Study yet.
                  Share comet-study.vercel.app with your class.
                </p>
              )}
            </Panel>
          </aside>
        </div>
      ) : null}

      {tab === "settings" ? (
        <div className="split">
          <div className="split-main">
            {owner ? (
              <Panel title="Group details" icon="settings" id="edit">
                <GroupForm group={group} />
              </Panel>
            ) : (
              <Panel title="About this group" id="about">
                <dl className="facts">
                  <dt>Organizer</dt>
                  <dd>{active.find((m) => m.role === "owner")?.name ?? "—"}</dd>
                  <dt>Study style</dt>
                  <dd>
                    {group.styles
                      .map((s) => labelOf(STUDY_STYLES, s))
                      .join(", ") || "Not set"}
                  </dd>
                  <dt>Goals</dt>
                  <dd>
                    {group.goals
                      .map((g) => labelOf(STUDY_GOALS, g))
                      .join(", ") || "Not set"}
                  </dd>
                </dl>
              </Panel>
            )}
          </div>
          <aside className="split-side">
            <Panel title="Leave or archive" id="danger" className="danger-zone">
              <ActionForm
                action={leaveGroupAction}
                hidden={{ groupId: id, redirect: "groups" }}
              >
                <p className="muted-note">
                  {owner && active.length > 1
                    ? "If you leave, the longest-standing member becomes organizer."
                    : owner
                      ? "You’re the only member; leaving archives the group."
                      : "You can rejoin later if there’s a seat."}
                </p>
                <ConfirmSubmit prompt="Leave this group?" confirmLabel="Leave">
                  Leave group
                </ConfirmSubmit>
              </ActionForm>
              {owner ? (
                <ActionForm
                  action={archiveGroupAction}
                  hidden={{ groupId: id }}
                >
                  <p className="muted-note">
                    Archiving hides the group from everyone’s dashboards and
                    match results.
                  </p>
                  <ConfirmSubmit
                    prompt="Archive for everyone?"
                    confirmLabel="Archive"
                  >
                    Archive group
                  </ConfirmSubmit>
                </ActionForm>
              ) : null}
            </Panel>
          </aside>
        </div>
      ) : null}
    </main>
  );
}

function SessionCard({
  session,
  userId,
  owner,
  now,
}: {
  session: Awaited<ReturnType<typeof listGroupSessions>>[number];
  userId: string;
  owner: boolean;
  now: Date;
}) {
  return (
    <article className="session-card">
      <div className="next-when">
        <span className="next-rel">{relativeDay(session.startsAt, now)}</span>
        <span className="next-day">{formatDay(session.startsAt)}</span>
        <strong>{formatTimeRange(session.startsAt, session.endsAt)}</strong>
      </div>
      <div className="next-body">
        <h3>{session.title}</h3>
        <p className="next-where">
          <Icon name="pin" size={16} />{" "}
          {session.location ?? "Location to be decided"}
          <span className="dot" aria-hidden="true">
            ·
          </span>
          {session.going} going{session.maybe ? `, ${session.maybe} maybe` : ""}
        </p>
        {session.notes ? (
          <p className="session-notes">{session.notes}</p>
        ) : null}
        <div className="next-actions">
          <RsvpControl sessionId={session.id} current={session.myRsvp} />
          <SessionCalendarLinks session={session} />
          {owner || session.createdBy === userId ? (
            <ActionForm
              action={cancelSessionAction}
              hidden={{ sessionId: session.id }}
            >
              <ConfirmSubmit
                className="text-button danger"
                prompt="Cancel for everyone?"
                confirmLabel="Cancel session"
              >
                Cancel
              </ConfirmSubmit>
            </ActionForm>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function SessionForm({ groupId, search }: { groupId: string; search: Search }) {
  const today = campusDate(new Date());
  const date =
    isDateString(search.date) && search.date >= today
      ? search.date
      : addDays(today, 1);
  const time = (value: string | undefined, fallback: string) =>
    value && /^\d{2}:\d{2}$/.test(value) ? value : fallback;
  return (
    <ActionForm
      action={createSessionAction}
      hidden={{ groupId }}
      className="stack-form"
      resetOnSuccess
    >
      <label className="form-field">
        <span className="field-label">Title</span>
        <SmoothInput
          className="field"
          name="title"
          required
          maxLength={80}
          defaultValue="Study session"
        />
      </label>
      <label className="form-field">
        <span className="field-label">Date</span>
        <input
          className="field"
          type="date"
          name="date"
          required
          min={today}
          defaultValue={date}
        />
      </label>
      <div className="form-row">
        <label className="form-field">
          <span className="field-label">From</span>
          <input
            className="field"
            type="time"
            name="start"
            required
            step={900}
            defaultValue={time(search.start, "18:00")}
          />
        </label>
        <label className="form-field">
          <span className="field-label">To</span>
          <input
            className="field"
            type="time"
            name="end"
            required
            step={900}
            defaultValue={time(search.end, "19:30")}
          />
        </label>
      </div>
      <label className="form-field">
        <span className="field-label">Where</span>
        <RoomCombobox
          name="location"
          maxLength={120}
          defaultValue={search.room?.slice(0, 120) ?? ""}
          placeholder="ECSS 2.410, or a meeting link"
        />
      </label>
      <Link
        className="text-link small"
        href={`/rooms?group=${groupId}&date=${date}`}
      >
        <Icon name="rooms" size={15} /> Find a free room
      </Link>
      <label className="form-field">
        <span className="field-label">
          Notes <em>optional</em>
        </span>
        <SmoothTextarea
          className="field"
          name="notes"
          rows={2}
          maxLength={600}
          placeholder="Bring problem set 4"
        />
      </label>
      <p className="fine-print">
        Times are {TZ_LABEL}. You’re marked as going.
      </p>
      <div className="form-actions">
        <SubmitButton pendingLabel="Scheduling…">Schedule</SubmitButton>
      </div>
    </ActionForm>
  );
}

function GroupPreview({ group }: { group: GroupSummary & { term: string } }) {
  const full = group.memberCount >= group.capacity;
  return (
    <main id="main" className="app-page narrow" tabIndex={-1}>
      <header className="group-hero">
        <div className="group-hero-top">
          <Link className="back-link" href="/groups">
            ← Groups
          </Link>
          <div className="group-badges">
            <CourseTag code={group.courseCode} />
            {group.sectionNumber ? (
              <Badge>Section {group.sectionNumber}</Badge>
            ) : null}
            <Badge>{labelOf(GROUP_MODALITIES, group.modality)}</Badge>
          </div>
        </div>
        <h1>{group.name}</h1>
        <p className="group-hero-sub">
          {group.courseTitle}
          {group.cadence ? ` · ${group.cadence}` : ""}
        </p>
        {group.description ? (
          <p className="group-hero-desc">{group.description}</p>
        ) : null}
        <div className="group-hero-foot">
          <Avatars
            names={group.members.map((m) => m.name)}
            total={group.memberCount}
          />
          <span className="seat-count">
            <Seats count={group.memberCount} capacity={group.capacity} />
            {full ? "Full" : `${group.capacity - group.memberCount} seats open`}
          </span>
        </div>
      </header>
      <Panel>
        {group.myStatus === "pending" ? (
          <div className="preview-cta">
            <p>
              Your request is with the organizer. You’ll see the group on your
              dashboard once you’re in.
            </p>
            <ActionForm
              action={leaveGroupAction}
              hidden={{ groupId: group.id }}
            >
              <SubmitButton className="button ghost">
                Withdraw request
              </SubmitButton>
            </ActionForm>
          </div>
        ) : (
          <div className="preview-cta">
            <p>
              {group.myStatus === "invited"
                ? "You’ve been invited. Join to see sessions, the shared library and exam dates."
                : "Members see sessions, the shared library and exam dates."}
            </p>
            <div className="row-actions">
              <ActionForm
                action={joinGroupAction}
                hidden={{ groupId: group.id }}
              >
                <SubmitButton disabled={full} pendingLabel="Joining…">
                  {group.myStatus === "invited"
                    ? "Accept invite"
                    : group.joinPolicy === "open"
                      ? "Join group"
                      : "Request to join"}
                </SubmitButton>
              </ActionForm>
              {group.myStatus === "invited" ? (
                <ActionForm
                  action={leaveGroupAction}
                  hidden={{ groupId: group.id }}
                >
                  <SubmitButton className="button ghost">Decline</SubmitButton>
                </ActionForm>
              ) : null}
            </div>
          </div>
        )}
      </Panel>
    </main>
  );
}
