import { redirect } from "next/navigation";

// The old "study table" page; courses now live in the app at /courses.
export default function AccountPage() {
  redirect("/courses");
}
