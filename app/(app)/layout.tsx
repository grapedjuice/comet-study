import { initials } from "@/lib/app-errors";
import { requireStudent } from "@/lib/app-session";
import AppNav from "./ui/app-nav";
import { Toaster } from "./ui/forms";
import "./app.css";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { user } = await requireStudent();
  const name = user.name ?? user.email.split("@")[0];
  return (
    <div className="app-shell">
      <AppNav name={name} initials={initials(name)} email={user.email} />
      <div className="app-main">{children}</div>
      <Toaster />
    </div>
  );
}
