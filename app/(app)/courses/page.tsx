import type { Metadata } from "next";
import { requireStudent } from "@/lib/app-session";
import { listUserCourses } from "@/lib/courses";
import CoursesManager from "../../ui/courses-manager";
import { PageHeader } from "../ui/bits";

export const metadata: Metadata = { title: "Courses — Comet Study" };

export default async function CoursesPage() {
  const { db, user, term, termLabel } = await requireStudent();
  const courses = await listUserCourses(db, user.id, term);
  return (
    <main id="main" className="app-page" tabIndex={-1}>
      <PageHeader
        kicker={`Your courses · ${termLabel}`}
        title="What you’re"
        accent="taking."
      >
        <p>
          Groups and matches are built around these. Adding your section lets us
          show class times on your calendar.
        </p>
      </PageHeader>
      <CoursesManager initialCourses={courses} termLabel={termLabel} />
      <p className="account-footnote">
        Why not sync straight from Orion? UT Dallas only grants sign-on and
        student-record access to apps sponsored by faculty or staff, so for now
        your courses come from the public UTD catalog (via Nebula Labs) and what
        you add or paste here.
      </p>
    </main>
  );
}
