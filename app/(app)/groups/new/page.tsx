import type { Metadata } from "next";
import { requireStudent } from "@/lib/app-session";
import { listUserCourses } from "@/lib/courses";
import { Empty, PageHeader, Panel } from "../../ui/bits";
import { GroupForm } from "../group-form";

export const metadata: Metadata = { title: "New group — Comet Study" };

export default async function NewGroupPage({
  searchParams,
}: {
  searchParams: Promise<{ course?: string }>;
}) {
  const { db, user, term } = await requireStudent();
  const [{ course }, courses] = await Promise.all([
    searchParams,
    listUserCourses(db, user.id, term),
  ]);
  return (
    <main id="main" className="app-page narrow" tabIndex={-1}>
      <PageHeader kicker="Study groups" title="Start a" accent="group.">
        <p>
          Groups are 4–8 classmates from one course. You’ll be the organizer;
          you can hand that off anytime.
        </p>
      </PageHeader>
      <Panel>
        {courses.length ? (
          <GroupForm
            courses={courses.map((c) => ({ code: c.code, title: c.title }))}
            course={course}
          />
        ) : (
          <Empty
            title="Add a course first"
            action={{ href: "/courses", label: "Add courses" }}
          >
            Groups belong to a course you’re taking this term.
          </Empty>
        )}
      </Panel>
    </main>
  );
}
