import type { Metadata } from "next";
import { requireStudent } from "@/lib/app-session";
import { listUserCourses } from "@/lib/courses";
import { classSlots, getProfile } from "@/lib/matching";
import { PageHeader } from "../ui/bits";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Profile — Comet Study" };

export default async function ProfilePage() {
  const { db, user, term } = await requireStudent();
  const [profile, courses] = await Promise.all([
    getProfile(db, user.id),
    listUserCourses(db, user.id, term),
  ]);
  return (
    <main id="main" className="app-page" tabIndex={-1}>
      <PageHeader kicker="Profile" title="How you" accent="study.">
        <p>This powers your matches. Signed in as {user.email}.</p>
      </PageHeader>
      <ProfileForm
        name={user.name ?? ""}
        profile={profile}
        classSlots={[
          ...classSlots(
            courses.map((c) => ({ code: c.code, schedule: c.schedule })),
          ),
        ]}
      />
    </main>
  );
}
