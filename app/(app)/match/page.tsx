import type { Metadata } from "next";
import Link from "next/link";
import { requireStudent } from "@/lib/app-session";
import { listUserCourses } from "@/lib/courses";
import { listMyGroups } from "@/lib/groups";
import {
  findMatches,
  getProfile,
  SCORE_PARTS,
  type ScoreComponents,
} from "@/lib/matching";
import {
  GROUP_MODALITIES,
  labelOf,
  STUDY_GOALS,
  STUDY_STYLES,
} from "@/lib/study-options";
import {
  inviteAction,
  joinGroupAction,
  startGroupWithAction,
} from "../actions";
import { Avatars, Badge, Empty, PageHeader, Panel, Seats } from "../ui/bits";
import { ActionForm, SubmitButton } from "../ui/forms";
import { Icon } from "../ui/icons";

export const metadata: Metadata = { title: "Find matches — Comet Study" };

export default async function MatchPage({
  searchParams,
}: {
  searchParams: Promise<{ course?: string }>;
}) {
  const { db, user, term } = await requireStudent();
  const [search, courses, profile, myGroups] = await Promise.all([
    searchParams,
    listUserCourses(db, user.id, term),
    getProfile(db, user.id),
    listMyGroups(db, user.id, term),
  ]);
  const course = courses.find((c) => c.code === search.course) ?? courses[0];

  if (!course)
    return (
      <main id="main" className="app-page narrow" tabIndex={-1}>
        <PageHeader kicker="Matchmaking" title="Find your" accent="people." />
        <Panel>
          <Empty
            title="Add a course first"
            action={{ href: "/courses", label: "Add courses" }}
          >
            Matches are made within a course you’re taking.
          </Empty>
        </Panel>
      </main>
    );

  const matches = await findMatches(db, user.id, term, course.code);
  const inviteGroups = myGroups.filter(
    (g) =>
      g.myStatus === "active" &&
      g.courseCode === course.code &&
      g.memberCount < g.capacity,
  );

  return (
    <main id="main" className="app-page" tabIndex={-1}>
      <PageHeader kicker="Matchmaking" title="Find your" accent="people.">
        <p>
          Ranked by shared free time, study style and goals. We only say{" "}
          <em>how much</em> your times overlap, never anyone’s schedule.
        </p>
      </PageHeader>

      <nav className="filter-chips" aria-label="Choose a course">
        {courses.map((c) => (
          <Link
            key={c.code}
            className={`chip-link${c.code === course.code ? " is-on" : ""}`}
            href={`/match?course=${encodeURIComponent(c.code)}`}
            aria-current={c.code === course.code ? "page" : undefined}
          >
            {c.code}
          </Link>
        ))}
      </nav>

      <section className="profile-strip" aria-label="Your matching preferences">
        <div>
          <p className="field-label">Matching on</p>
          <p className="profile-strip-tags">
            {profile.styles.length || profile.goals.length ? (
              [
                ...profile.styles.map((s) => labelOf(STUDY_STYLES, s)),
                ...profile.goals.map((g) => labelOf(STUDY_GOALS, g)),
              ].map((label) => <Badge key={label}>{label}</Badge>)
            ) : (
              <span className="muted-note">No study style or goals yet</span>
            )}
            <Badge tone={profile.availability.length ? "good" : "warn"}>
              {profile.availability.length
                ? `${profile.availability.length} free hours / week`
                : "No free times set"}
            </Badge>
          </p>
        </div>
        <Link className="button ghost small" href="/profile">
          <Icon name="settings" size={16} /> Edit preferences
        </Link>
      </section>
      {!matches.profileComplete ? (
        <p className="notice">
          <Icon name="spark" size={16} /> Add your free hours in{" "}
          <Link href="/profile">your profile</Link> — overlap is 40% of every
          match score.
        </p>
      ) : null}

      <Panel
        title={`Groups in ${course.code}`}
        icon="groups"
        id="group-matches"
      >
        {matches.groups.length ? (
          <ul className="match-list">
            {matches.groups.map((g) => (
              <li key={g.id} className="match-card">
                <Score value={g.score} parts={g.components} />
                <div className="match-body">
                  <h3>
                    <Link href={`/groups/${g.id}`}>{g.name}</Link>
                    {g.sectionNumber ? (
                      <Badge>Section {g.sectionNumber}</Badge>
                    ) : null}
                  </h3>
                  <p className="match-sub">
                    {labelOf(GROUP_MODALITIES, g.modality)}
                    {g.cadence ? ` · ${g.cadence}` : ""}
                  </p>
                  <ul className="reasons">
                    {g.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                  <div className="group-card-foot">
                    <Avatars names={g.members} total={g.memberCount} />
                    <Seats count={g.memberCount} capacity={g.capacity} />
                  </div>
                </div>
                <div className="match-actions">
                  {g.myStatus === "pending" ? (
                    <Badge tone="info">Requested</Badge>
                  ) : (
                    <ActionForm
                      action={joinGroupAction}
                      hidden={{ groupId: g.id }}
                    >
                      <SubmitButton
                        className="button primary small"
                        pendingLabel="Sending…"
                      >
                        {g.myStatus === "invited"
                          ? "Accept invite"
                          : g.joinPolicy === "open"
                            ? "Join"
                            : "Ask to join"}
                      </SubmitButton>
                    </ActionForm>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty
            title={`No open groups in ${course.code} yet`}
            action={{
              href: `/groups/new?course=${encodeURIComponent(course.code)}`,
              label: "Start one",
            }}
          >
            Start a group and invite the classmates below.
          </Empty>
        )}
      </Panel>

      <Panel
        title={`Classmates in ${course.code}`}
        icon="match"
        id="people-matches"
      >
        {matches.people.length ? (
          <ul className="match-list">
            {matches.people.map((p) => (
              <li key={p.id} className="match-card">
                <Score value={p.score} parts={p.components} />
                <div className="match-body">
                  <h3>
                    {p.name}
                    {p.sectionNumber ? (
                      <Badge>Section {p.sectionNumber}</Badge>
                    ) : null}
                    {p.inMyGroup ? (
                      <Badge tone="good">In your group</Badge>
                    ) : null}
                  </h3>
                  <ul className="reasons">
                    {p.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </div>
                <div className="match-actions">
                  {p.inMyGroup ? null : inviteGroups.length ? (
                    inviteGroups.map((g) =>
                      p.invitedTo.includes(g.id) ? (
                        <Badge key={g.id} tone="info">
                          Invited
                        </Badge>
                      ) : (
                        <ActionForm
                          key={g.id}
                          action={inviteAction}
                          hidden={{ groupId: g.id, userId: p.id }}
                        >
                          <SubmitButton
                            className="button primary small"
                            pendingLabel="Inviting…"
                          >
                            Invite
                            {inviteGroups.length > 1 ? ` to ${g.name}` : ""}
                          </SubmitButton>
                        </ActionForm>
                      ),
                    )
                  ) : (
                    <ActionForm
                      action={startGroupWithAction}
                      hidden={{ courseCode: course.code, userId: p.id }}
                    >
                      <SubmitButton
                        className="button primary small"
                        pendingLabel="Starting…"
                      >
                        Start a group together
                      </SubmitButton>
                    </ActionForm>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty title="No classmates here yet">
            You’re early. When other {course.code} students join Comet Study,
            they’ll show up here ranked by fit.
          </Empty>
        )}
      </Panel>
    </main>
  );
}

/**
 * The match ring. Tapping it opens the breakdown: points earned out of each
 * part's weight (lib/matching.ts SCORE_PARTS), so "52" means something.
 */
function Score({ value, parts }: { value: number; parts: ScoreComponents }) {
  // Whole points per part that add up to the score shown: floor each, then
  // hand the leftover points to the largest remainders.
  const exact = SCORE_PARTS.map((part) => parts[part.key] * part.weight);
  const points = exact.map(Math.floor);
  const spare = value - points.reduce((sum, n) => sum + n, 0);
  exact
    .map((x, i) => ({ i, rest: x - Math.floor(x) }))
    .sort((a, b) => b.rest - a.rest)
    .slice(0, Math.max(0, spare))
    .forEach(({ i }) => points[i]++);
  return (
    <details className="score-details">
      <summary
        className="score"
        style={{ "--score": value } as React.CSSProperties}
        aria-label={`${value} out of 100 match. Show how it's scored`}
      >
        <svg viewBox="0 0 44 44" aria-hidden="true">
          <circle cx="22" cy="22" r="19" className="score-track" />
          <circle
            cx="22"
            cy="22"
            r="19"
            className="score-fill"
            pathLength={100}
          />
        </svg>
        <span>{value}</span>
        <small aria-hidden="true">match</small>
      </summary>
      <div className="score-pop">
        <p className="score-pop-head">
          <strong>{value}</strong> / 100 match
        </p>
        <ul>
          {SCORE_PARTS.map((part, i) => {
            const got = Math.min(part.weight, points[i]);
            return (
              <li key={part.key}>
                <span>{part.label}</span>
                <i aria-hidden="true">
                  <b style={{ width: `${(got / part.weight) * 100}%` }} />
                </i>
                <em>
                  {got}/{part.weight}
                </em>
              </li>
            );
          })}
        </ul>
        <p className="score-pop-note">
          Anything one of you hasn’t filled in counts as half, so adding your
          free hours, styles and goals in your profile sharpens every score.
        </p>
      </div>
    </details>
  );
}
