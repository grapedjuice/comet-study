import type { Metadata } from "next";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import {
  currentTerm,
  listUserCourses,
  termLabel,
  type UserCourse,
} from "../../../lib/courses";
import { currentUserContext } from "../../../lib/request-context";
import Onboarding from "./onboarding";

export const metadata: Metadata = { title: "Welcome — Comet Study" };

export default async function WelcomePage() {
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
  if (user.onboardingCompletedAt) redirect("/dashboard");

  return (
    <main id="main" className="welcome-page" tabIndex={-1}>
      <Onboarding
        initialName={user.name ?? ""}
        initialCourses={courses}
        termLabel={termLabel(term)}
      />
    </main>
  );
}
