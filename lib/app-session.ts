import { redirect } from "next/navigation";
import { connection } from "next/server";
import { currentTerm, termLabel } from "./courses";
import { currentUserContext } from "./request-context";

/**
 * Signed-in, onboarded student for an app page; redirects otherwise. Every
 * app page renders per request because it depends on the session cookie.
 */
export async function requireStudent() {
  await connection();
  let context;
  try {
    context = await currentUserContext();
  } catch {
    context = null;
  }
  if (!context?.user) redirect("/sign-in");
  if (!context.user.onboardingCompletedAt) redirect("/welcome");
  const term = currentTerm();
  return { ...context, user: context.user, term, termLabel: termLabel(term) };
}
