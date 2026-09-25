import type { Metadata } from "next";
import Link from "next/link";
import { requireStudent } from "@/lib/app-session";
import { listUserCourses } from "@/lib/courses";
import {
  listCourseGroups,
  listMyGroups,
  type GroupSummary,
} from "@/lib/groups";
import { GROUP_MODALITIES, labelOf, STUDY_STYLES } from "@/lib/study-options";
import { formatRange } from "@/lib/time";
import { dismissAction, joinGroupAction, leaveGroupAction } from "../actions";
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
import { Icon } from "../ui/icons";

export const metadata: Metadata = { title: "Groups — Comet Study" };

export default async function GroupsPage({
  searchParams,
}: {
  searchParams: Promise<{ course?: string }>;
}) {
  const { db, user, term, termLabel } = await requireStudent();
  const [{ course }, mine, open, courses] = await Promise.all([
    searchParams,
    listMyGroups(db, user.id, term),
    listCourseGroups(db, user.id, term),
    listUserCourses(db, user.id, term),
  ]);
  const active = mine.filter((g) => g.myStatus === "active");
  const waiting = mine.filter((g) => g.myStatus !== "active");
  const shown = open.filter(
    (g) => g.myStatus === null && (!course || g.courseCode === course),
  );

  return (
    <main id="main" className="app-page" tabIndex={-1}>
      <PageHeader
        kicker={`Study groups · ${termLabel}`}
        title="Your"
        accent="people."
        actions={
          <Link
            className="button primary"
            href={`/groups/new${course ? `?course=${encodeURIComponent(course)}` : ""}`}
          >
            <Icon name="plus" size={18} /> <span>New group</span>
          </Link>
        }
      >
        <p>
          Join an open group in one of your courses, or start one and invite
          classmates.
        </p>
      </PageHeader>

      {waiting.length ? (
        <Panel title="Invitations & requests" icon="bell" id="waiting">
          <ul className="list-rows">
            {waiting.map((group) => (
              <li key={group.id} className="list-row">
                <div>
                  <p className="row-title">
                    <CourseTag code={group.courseCode} />{" "}
                    <Link href={`/groups/${group.id}`}>{group.name}</Link>
                  </p>
                  <p className="row-sub">
                    {group.myStatus === "invited"
                      ? "You’ve been invited"
                      : "Waiting for the organizer to approve"}{" "}
                    · {group.memberCount}/{group.capacity} members
                  </p>
                </div>
                <div className="row-actions">
                  {group.myStatus === "invited" ? (
                    <ActionForm
                      action={joinGroupAction}
                      hidden={{ groupId: group.id }}
                    >
                      <SubmitButton
                        className="button primary small"
                        pendingLabel="Joining…"
                      >
                        Accept
                      </SubmitButton>
                    </ActionForm>
                  ) : null}
                  <ActionForm
                    action={leaveGroupAction}
                    hidden={{ groupId: group.id }}
                  >
                    <SubmitButton className="button ghost small">
                      {group.myStatus === "invited" ? "Decline" : "Withdraw"}
                    </SubmitButton>
                  </ActionForm>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <Panel title="Your groups" icon="groups" id="mine">
        {active.length ? (
          <ul className="group-cards">
            {active.map((group) => (
              <li key={group.id}>
                <Link className="group-card" href={`/groups/${group.id}`}>
                  <div className="group-card-top">
                    <CourseTag code={group.courseCode} />
                    {group.myRole === "owner" ? (
                      <Badge tone="info">Organizer</Badge>
                    ) : null}
                    {group.myRole === "owner" && group.pendingCount ? (
                      <Badge tone="warn">{group.pendingCount} waiting</Badge>
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
          </ul>
        ) : (
          <Empty title="You’re not in a group yet">
            Pick one below, or start your own in a minute.
          </Empty>
        )}
      </Panel>

      <Panel title="Open in your courses" icon="search" id="open">
        <nav className="filter-chips" aria-label="Filter by course">
          <Link
            className={`chip-link${course ? "" : " is-on"}`}
            href="/groups"
            aria-current={course ? undefined : "page"}
          >
            All courses
          </Link>
          {courses.map((c) => (
            <Link
              key={c.code}
              className={`chip-link${course === c.code ? " is-on" : ""}`}
              href={`/groups?course=${encodeURIComponent(c.code)}`}
              aria-current={course === c.code ? "page" : undefined}
            >
              {c.code}
            </Link>
          ))}
        </nav>
        {shown.length ? (
          <ul className="browse-grid">
            {shown.map((group) => (
              <OpenGroupCard key={group.id} group={group} />
            ))}
          </ul>
        ) : (
          <Empty
            title={
              course
                ? `No open groups in ${course} yet`
                : "No open groups in your courses yet"
            }
            action={{
              href: `/groups/new${course ? `?course=${encodeURIComponent(course)}` : ""}`,
              label: "Start the first one",
            }}
          >
            Classmates who join Comet Study after you will see your group here.
          </Empty>
        )}
      </Panel>
    </main>
  );
}

function OpenGroupCard({ group }: { group: GroupSummary }) {
  const full = group.memberCount >= group.capacity;
  return (
    <li className="browse-card">
      <div className="group-card-top">
        <CourseTag code={group.courseCode} />
        {group.sectionNumber ? (
          <Badge>Section {group.sectionNumber}</Badge>
        ) : null}
        <Badge tone={group.joinPolicy === "open" ? "good" : "neutral"}>
          {group.joinPolicy === "open" ? "Open" : "Ask to join"}
        </Badge>
      </div>
      <h3>
        <Link href={`/groups/${group.id}`}>{group.name}</Link>
      </h3>
      {group.description ? (
        <p className="browse-desc">{group.description}</p>
      ) : null}
      <p className="browse-meta">
        {labelOf(GROUP_MODALITIES, group.modality)}
        {group.cadence ? ` · ${group.cadence}` : ""}
        {group.styles.length
          ? ` · ${group.styles.map((s) => labelOf(STUDY_STYLES, s)).join(", ")}`
          : ""}
      </p>
      <div className="group-card-foot">
        <Avatars
          names={group.members.map((m) => m.name)}
          total={group.memberCount}
        />
        <span className="seat-count">
          <Seats count={group.memberCount} capacity={group.capacity} />
          {full ? "Full" : `${group.capacity - group.memberCount} open`}
        </span>
      </div>
      <div className="browse-actions">
        <ActionForm action={joinGroupAction} hidden={{ groupId: group.id }}>
          <SubmitButton
            className="button primary small"
            disabled={full}
            pendingLabel="Sending…"
          >
            {group.joinPolicy === "open" ? "Join group" : "Request to join"}
          </SubmitButton>
        </ActionForm>
        <ActionForm
          action={dismissAction}
          hidden={{ targetType: "group", targetId: group.id }}
        >
          <SubmitButton className="button ghost small" title="Hide this group">
            Not for me
          </SubmitButton>
        </ActionForm>
      </div>
    </li>
  );
}
