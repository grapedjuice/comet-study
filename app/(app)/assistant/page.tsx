import type { Metadata } from "next";
import { requireStudent } from "@/lib/app-session";
import { assistantOpeners } from "@/lib/assistant";
import { PageHeader, Panel } from "../ui/bits";
import { Assistant } from "../ui/assistant";

export const metadata: Metadata = { title: "Assistant — Comet Study" };

export default async function AssistantPage() {
  const { db, user, term, env } = await requireStudent();
  const openers = env.ANTHROPIC_API_KEY
    ? await assistantOpeners(db, user.id, term)
    : [];

  return (
    <main id="main" className="app-page assistant-page" tabIndex={-1}>
      <PageHeader
        kicker="Study assistant"
        title="Ask it to"
        accent="sort your week out."
      >
        <p>
          It can see your groups, courses, sessions, exam dates and shared
          library — nothing else, and nothing from groups you aren’t in. It can
          find a time everyone’s free and put the session on the calendar.
        </p>
      </PageHeader>

      {env.ANTHROPIC_API_KEY ? (
        <Assistant
          suggestions={openers}
          scope="Your groups, courses, sessions, exam dates, free rooms and everything shared in your library."
        />
      ) : (
        <Panel title="Not connected" icon="spark" id="assistant-off">
          <p className="muted-note">
            The study assistant isn’t connected on this server. Set
            <code> ANTHROPIC_API_KEY</code> and restart to turn it on.
          </p>
        </Panel>
      )}
    </main>
  );
}
