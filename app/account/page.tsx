import type { Metadata } from "next";
import { connection } from "next/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  currentTerm,
  listUserCourses,
  termLabel,
  type UserCourse,
} from "../../lib/courses";
import { currentUserContext } from "../../lib/request-context";
import { FadeUp } from "../ui/motion";
import CoursesManager from "./courses-manager";
import SignOutButton from "./sign-out-button";

export const metadata: Metadata = { title: "Your study table — Comet Study" };

export default async function AccountPage() {
  await connection(); // Per-request: depends on the session cookie.
  const term = currentTerm();
  let user;
  let courses: UserCourse[] = [];
  try {
    const context = await currentUserContext();
    user = context.user;
    if (user) courses = await listUserCourses(context.db, user.id, term);
  } catch {
    user = null;
  }
  if (!user) redirect("/sign-in");
  if (!user.onboardingCompletedAt) redirect("/welcome");
  const first = (user.name ?? user.email.split("@")[0]).split(" ")[0];

  return (
    <main id="main" className="account-page" tabIndex={-1}>
      <FadeUp>
        <p className="section-kicker">Your study table</p>
        <h1>
          Welcome, <em className="gradient-serif">{first}.</em>
        </h1>
        <p className="account-meta">
          Signed in as {user.email} · session active until{" "}
          {user.sessionExpiresAt.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })}
        </p>
      </FadeUp>
      <FadeUp delay={0.15}>
        <CoursesManager initialCourses={courses} termLabel={termLabel(term)} />
      </FadeUp>
      <FadeUp delay={0.3}>
        <p className="account-footnote">
          Why not sync straight from Orion? UT Dallas only grants sign-on and
          student-record access to apps sponsored by faculty or staff, so for
          now your courses come from the public UTD catalog (via Nebula Labs)
          and what you add or paste here.
        </p>
        <div className="account-actions">
          <Link className="button ghost" href="/#demo">
            See the group demo
          </Link>
          <SignOutButton />
        </div>
      </FadeUp>
    </main>
  );
}
