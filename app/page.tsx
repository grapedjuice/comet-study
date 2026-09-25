import Link from "next/link";
import { connection } from "next/server";
import {
  countClassmates,
  currentTerm,
  listUserCourses,
  termLabel,
} from "../lib/courses";
import { currentUserContext } from "../lib/request-context";
import { StudyDemo } from "./study-demo";
import Marquee from "./ui/marquee";
import {
  BlurText,
  FadeUp,
  Rise,
  SpotlightGroup,
  StackingCard,
  StackingCards,
  TiltPanel,
} from "./ui/motion";

const marqueeCourses = [
  "CS 2336",
  "MATH 2414",
  "PHYS 2325",
  "CS 3345",
  "CHEM 1311",
  "MATH 2418",
  "ECS 2390",
  "BIOL 2311",
  "CS 2305",
  "STAT 3360",
  "PHYS 2326",
  "ACCT 2301",
];

const features = [
  {
    kicker: "Course-aware",
    title: "Starts from the classes you’re in.",
    body: "Groups form around a shared course, so the first conversation already has something to talk about.",
    wide: true,
    art: "orbit",
  },
  {
    kicker: "Overlap finder",
    title: "Times that work for everyone.",
    body: "See the hours your group has in common instead of a group chat full of “when works?”",
    art: "grid",
  },
  {
    kicker: "Study styles",
    title: "Match how you learn.",
    body: "Practice problems, talking it through, or drawing it out — pick what helps.",
    art: "chips",
  },
  {
    kicker: "Weekly rhythm",
    title: "Make it a habit, not a scramble.",
    body: "Carry a good session forward so next week is already on the table.",
    art: "rhythm",
  },
  {
    kicker: "Private by default",
    title: "Share a time, not your week.",
    body: "Availability sharing is designed to reveal only the overlap a group needs.",
    art: "shield",
  },
];

function FeatureArt({ kind }: { kind: string }) {
  if (kind === "orbit")
    return (
      <div className="art-orbit" aria-hidden="true">
        <span className="orbit-ring r1" />
        <span className="orbit-ring r2" />
        <span className="orbit-core">CS 2336</span>
        <span className="avatar tone-0 o1">AJ</span>
        <span className="avatar tone-1 o2">MR</span>
        <span className="avatar tone-2 o3">SK</span>
      </div>
    );
  if (kind === "grid")
    return (
      <div className="art-grid" aria-hidden="true">
        {Array.from({ length: 15 }, (_, index) => (
          <i
            key={index}
            className={
              index === 7
                ? "hit"
                : [2, 4, 6, 11, 12].includes(index)
                  ? "soft"
                  : ""
            }
          />
        ))}
      </div>
    );
  if (kind === "chips")
    return (
      <div className="art-chips" aria-hidden="true">
        <span>Practice problems</span>
        <span className="on">Talk it through</span>
        <span>Draw it out</span>
        <span className="on">Compare notes</span>
      </div>
    );
  if (kind === "rhythm")
    return (
      <div className="art-rhythm" aria-hidden="true">
        {["Wk 1", "Wk 2", "Wk 3", "Wk 4"].map((week, index) => (
          <span key={week} className={index < 3 ? "done" : ""}>
            <i />
            {week}
          </span>
        ))}
      </div>
    );
  return (
    <div className="art-shield" aria-hidden="true">
      <div className="week-blur">
        {Array.from({ length: 21 }, (_, index) => (
          <i key={index} className={index === 9 ? "shared" : ""} />
        ))}
      </div>
      <span className="shield-tag">Only Wed 3–4 pm is shared</span>
    </div>
  );
}

async function loadViewer() {
  // Per-request: the page depends on the session cookie. Must sit outside the
  // try below, or the prerender bailout would be swallowed.
  await connection();
  try {
    const { db, user } = await currentUserContext();
    if (!user) return null;
    if (!user.onboardingCompletedAt) return { pending: true as const };
    const term = currentTerm();
    return {
      pending: false as const,
      name: user.name ?? user.email.split("@")[0],
      term: termLabel(term),
      courses: await listUserCourses(db, user.id, term),
      classmates: await countClassmates(db, user.id, term),
    };
  } catch {
    return null; // Anonymous landing page when the database isn't reachable.
  }
}

export default async function HomePage() {
  const viewer = await loadViewer();
  const me = viewer && !viewer.pending ? viewer : null;
  const first = me?.name.split(" ")[0];
  const classmates = me?.classmates ?? 0;
  return (
    <main id="main" tabIndex={-1}>
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <FadeUp>
            {me ? (
              <p className="eyebrow-pill">
                <span className="pulse" aria-hidden="true" /> Welcome back,{" "}
                {first}
              </p>
            ) : viewer?.pending ? (
              <Link className="eyebrow-pill" href="/welcome">
                <span className="pulse" aria-hidden="true" /> Finish setting up
                your study table →
              </Link>
            ) : (
              <p className="eyebrow-pill">
                <span className="pulse" aria-hidden="true" /> Made for the
                people in your lecture
              </p>
            )}
          </FadeUp>
          <h1 id="hero-title">
            <BlurText text="Same class." delay={0.1} />
            <br />
            <em className="gradient-serif">
              <BlurText text="Better company." delay={0.35} />
            </em>
          </h1>
          <FadeUp delay={0.55}>
            <p className="hero-description">
              {me
                ? `You’re taking ${me.courses.length} course${me.courses.length === 1 ? "" : "s"} this ${me.term}. ${
                    classmates
                      ? `${classmates} classmate${classmates === 1 ? " has" : "s have"} joined so far — your study table is below.`
                      : "Your study table is below — invite a classmate to start your first group."
                  }`
                : "A familiar face makes a hard class feel lighter. Find classmates, make a plan, and turn studying into something you do together."}
            </p>
          </FadeUp>
          <FadeUp delay={0.7} className="hero-actions">
            {me ? (
              <Link className="button primary" href="/account">
                Manage my courses <span aria-hidden="true">→</span>
              </Link>
            ) : (
              <Link className="button primary" href="/sign-in">
                Find my study group <span aria-hidden="true">→</span>
              </Link>
            )}
            <a className="button ghost" href="#how-it-works">
              See how it works
            </a>
          </FadeUp>
          <FadeUp delay={0.85}>
            <p className="access-note">
              {me ? (
                <>
                  {me.term} <span aria-hidden="true">·</span>{" "}
                  {me.courses.map((course) => course.code).join(" · ")}
                </>
              ) : (
                <>
                  For UT Dallas students <span aria-hidden="true">·</span> Free{" "}
                  <span aria-hidden="true">·</span> Try the preview below
                </>
              )}
            </p>
          </FadeUp>
        </div>
        <TiltPanel className="hero-product">
          <StudyDemo
            personal={me ? { name: me.name, courses: me.courses } : undefined}
          />
        </TiltPanel>
      </section>

      <section className="marquee-band" aria-label="Example courses">
        <p className="marquee-label">
          Built around the courses you’re actually in
        </p>
        <Marquee items={marqueeCourses} />
      </section>

      <section
        className="how-section"
        id="how-it-works"
        aria-labelledby="how-title"
        tabIndex={-1}
      >
        <Rise className="section-heading">
          <p className="section-kicker">How it works</p>
          <h2 id="how-title">
            Good company.
            <br />
            <em className="gradient-serif">A better study routine.</em>
          </h2>
          <p>
            Comet Study brings the parts of a good study group into one flow:
            people, a time, and a reason to meet again.
          </p>
        </Rise>

        <StackingCards className="stack" total={3}>
          <StackingCard index={0} className="stack-card tone-indigo">
            <div className="stack-copy">
              <p className="step-index">
                01 <span>Find your people</span>
              </p>
              <h3>Start with a shared class.</h3>
              <p>
                Find a few classmates taking the same course, then see if your
                study styles fit.
              </p>
            </div>
            <div
              className="course-example"
              aria-label="Illustrative course group preview"
              role="img"
            >
              <div className="example-top">
                <span>Computer Science II</span>
                <span>Example group</span>
              </div>
              <p className="course-code">
                CS<strong>2336</strong>
              </p>
              <p className="course-line">Good company for the hard parts.</p>
              <div className="mini-members">
                <span className="avatar tone-0">AJ</span>
                <span className="avatar tone-1">MR</span>
                <span className="avatar tone-2">SK</span>
                <span>Three classmates · practice problems</span>
              </div>
            </div>
          </StackingCard>
          <StackingCard index={1} className="stack-card tone-violet">
            <div className="stack-copy">
              <p className="step-index">
                02 <span>Find a time</span>
              </p>
              <h3>Look for the overlap.</h3>
              <p>
                Compare the moments that work and put a simple study session on
                the table.
              </p>
            </div>
            <div
              className="time-example"
              aria-label="Illustrative shared availability: Wednesday 3 to 4 pm works for everyone"
              role="img"
            >
              <div className="example-top">
                <span>Wednesday</span>
                <span>Example</span>
              </div>
              <div className="timeline-labels">
                <span />
                <span>2 pm</span>
                <span>3 pm</span>
                <span>4 pm</span>
              </div>
              <div className="timeline-row">
                <span>You</span>
                <div>
                  <i className="time-bar bar-you" />
                </div>
              </div>
              <div className="timeline-row">
                <span>Classmates</span>
                <div>
                  <i className="time-bar bar-group" />
                </div>
              </div>
              <div className="overlap-note">
                <span aria-hidden="true">✓</span> Wednesday, 3–4 pm works for
                everyone.
              </div>
            </div>
          </StackingCard>
          <StackingCard index={2} className="stack-card tone-teal">
            <div className="stack-copy">
              <p className="step-index">
                03 <span>Keep the rhythm</span>
              </p>
              <h3>Make showing up the easy part.</h3>
              <p>
                Carry a good session forward. Keep your group moving through the
                semester, one week at a time.
              </p>
            </div>
            <div
              className="routine-example"
              aria-label="Illustrative recurring weekly study schedule"
              role="img"
            >
              <p>Same crew. Next Wednesday.</p>
              <div className="week-strip">
                {["This week", "Next week", "Week after"].map((week, index) => (
                  <div
                    key={week}
                    className={index === 0 ? "week active" : "week"}
                  >
                    <span>{week}</span>
                    <strong>Wed</strong>
                    <span>3–4 pm</span>
                  </div>
                ))}
              </div>
              <p className="routine-caption">
                A sample rhythm, ready to make your own.
              </p>
            </div>
          </StackingCard>
        </StackingCards>
      </section>

      <section className="features-section" aria-labelledby="features-title">
        <Rise className="section-heading centered">
          <p className="section-kicker">What we’re building</p>
          <h2 id="features-title">
            Everything a study group needs.
            <br />
            <em className="gradient-serif">Nothing it doesn’t.</em>
          </h2>
        </Rise>
        <SpotlightGroup className="bento">
          {features.map((feature, index) => (
            <Rise
              key={feature.kicker}
              className={`bento-cell${feature.wide ? " wide" : ""}`}
              distance={90 + (index % 3) * 40}
            >
              <article className="bento-card" data-spotlight>
                <FeatureArt kind={feature.art} />
                <div className="bento-copy">
                  <p className="section-kicker">{feature.kicker}</p>
                  <h3>{feature.title}</h3>
                  <p>{feature.body}</p>
                </div>
              </article>
            </Rise>
          ))}
        </SpotlightGroup>
      </section>

      <section
        className="privacy-section"
        id="privacy"
        aria-labelledby="privacy-title"
        tabIndex={-1}
      >
        <Rise className="privacy-layout">
          <div className="privacy-main">
            <p className="section-kicker">A note on privacy</p>
            <h2 id="privacy-title">
              Good connections.
              <br />
              <em className="gradient-serif">Clear boundaries.</em>
            </h2>
            <p className="privacy-lede">
              A study group needs to find a time together. It doesn’t need your
              whole week.
            </p>
          </div>
          <div className="privacy-notes">
            <div className="privacy-note">
              <span>01</span>
              <div>
                <h3>Try the demo privately.</h3>
                <p>
                  It uses fictional classmates and example times. Your choices
                  stay on this page; nothing is booked or sent.
                </p>
              </div>
            </div>
            <div className="privacy-note">
              <span>02</span>
              <div>
                <h3>Sign-in stays minimal.</h3>
                <p>
                  We store your university email and a hashed, expiring sign-in
                  link — never a password.
                </p>
              </div>
            </div>
            <div className="privacy-note">
              <span>03</span>
              <div>
                <h3>Schedule controls are still taking shape.</h3>
                <p>
                  Group matching and availability sharing are in development.
                  We’ll explain how those choices work before they’re available.
                </p>
              </div>
            </div>
          </div>
        </Rise>
      </section>

      <section className="cta-section" aria-labelledby="cta-title">
        <Rise className="cta-card" distance={160} tilt={20}>
          <div className="cta-glow" aria-hidden="true" />
          <p className="section-kicker">Your seat is waiting</p>
          <h2 id="cta-title">
            Find your people
            <br />
            <em className="gradient-serif">this semester.</em>
          </h2>
          <p>Sign in with your UT Dallas email. No password, no setup.</p>
          <div className="hero-actions centered">
            <Link className="button primary large" href="/sign-in">
              Get started <span aria-hidden="true">→</span>
            </Link>
            <a className="button ghost" href="#demo">
              Back to the study table
            </a>
          </div>
        </Rise>
      </section>
    </main>
  );
}
