import type { Metadata } from "next";
import { requireStudent } from "@/lib/app-session";
import {
  listExamWindows,
  listMyCampusExams,
  listSectionsWithExams,
  REGISTRAR_FINALS_URL,
  TESTING_CENTER_URL,
} from "@/lib/campus-exams";
import { listUserCourses } from "@/lib/courses";
import CoursesManager from "../../ui/courses-manager";
import { PageHeader } from "../ui/bits";
import { ExamSchedule } from "../ui/exam-schedule";

export const metadata: Metadata = { title: "Courses — Comet Study" };

export default async function CoursesPage() {
  const { db, user, term, termLabel } = await requireStudent();
  const now = new Date();
  const [courses, exams, windows] = await Promise.all([
    listUserCourses(db, user.id, term),
    // From early in the term, so a final that already happened still counts.
    listMyCampusExams(
      db,
      user.id,
      new Date(now.getTime() - 150 * 86400000),
      new Date(now.getTime() + 200 * 86400000),
    ),
    listExamWindows(db, term),
  ]);
  const upcoming = exams.filter((e) => e.endsAt > now);
  const withFinal = new Set(
    exams.filter((e) => e.kind === "final").map((e) => e.courseCode),
  );
  const needSection = courses.filter((c) => !c.sectionNumber);
  // Which sections have exams listed, so "add your section" isn't a guess.
  const sectionsByCourse = needSection.length
    ? await listSectionsWithExams(
        db,
        term,
        needSection.map((c) => c.code),
      )
    : new Map<string, string[]>();
  const noFinal = courses.filter(
    (c) => c.sectionNumber && !withFinal.has(c.code),
  );
  const checked = [...exams, ...windows]
    .map((item) => item.syncedAt)
    .sort((a, b) => b.getTime() - a.getTime())[0];

  return (
    <main id="main" className="app-page" tabIndex={-1}>
      <PageHeader
        kicker={`Your courses · ${termLabel}`}
        title="What you’re"
        accent="taking."
      >
        <p>
          Groups and matches are built around these. Adding your section lets us
          show class times and your final exam on your calendar.
        </p>
      </PageHeader>
      <CoursesManager
        initialCourses={courses}
        termLabel={termLabel}
        refreshOnChange
      />

      <ExamSchedule
        exams={upcoming.map((e) => ({
          id: e.id,
          courseCode: e.courseCode,
          sectionNumber: e.sectionNumber,
          kind: e.kind,
          label: e.label,
          startsAt: e.startsAt.toISOString(),
          endsAt: e.endsAt.toISOString(),
          location: e.location,
          allDay: e.allDay,
          openDates: e.openDates,
          bookingUrl: e.bookingUrl,
          source: e.source,
        }))}
        windows={windows.map(({ label, startsOn, endsOn }) => ({
          label,
          startsOn,
          endsOn,
        }))}
        needSection={needSection.map((c) => ({
          code: c.code,
          sections: sectionsByCourse.get(c.code) ?? [],
        }))}
        noFinal={
          windows.length
            ? noFinal.map((c) => `${c.code}.${c.sectionNumber}`)
            : []
        }
        checked={checked?.toISOString() ?? null}
        now={now.toISOString()}
        sources={{
          registrar: REGISTRAR_FINALS_URL,
          testingCenter: TESTING_CENTER_URL,
        }}
      />

      <p className="account-footnote">
        Why not sync straight from Orion? UT Dallas only grants sign-on and
        student-record access to apps sponsored by faculty or staff, so for now
        your courses come from the public UTD catalog (via Nebula Labs) and what
        you add or paste here.
      </p>
    </main>
  );
}
