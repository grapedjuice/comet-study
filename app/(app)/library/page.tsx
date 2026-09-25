import type { Metadata } from "next";
import { isUuid } from "@/lib/app-errors";
import { requireStudent } from "@/lib/app-session";
import { listMyGroups } from "@/lib/groups";
import { listResources } from "@/lib/resources";
import { RESOURCE_KINDS } from "@/lib/study-options";
import { Empty, PageHeader, Panel } from "../ui/bits";
import { GlassSelect } from "../ui/glass-select";
import { Icon } from "../ui/icons";
import { SmoothInput } from "../../ui/smooth-input";
import { ResourceForm } from "../ui/resource-form";
import { ResourceList } from "../ui/resource-list";

export const metadata: Metadata = { title: "Library — Comet Study" };

type Search = { q?: string; group?: string; kind?: string; mine?: string };

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const { db, user, term } = await requireStudent();
  const [search, groups] = await Promise.all([
    searchParams,
    listMyGroups(db, user.id, term),
  ]);
  const active = groups.filter((g) => g.myStatus === "active");
  const groupId =
    isUuid(search.group) && active.some((g) => g.id === search.group)
      ? search.group
      : undefined;
  const kind = RESOURCE_KINDS.some((k) => k.id === search.kind)
    ? search.kind
    : undefined;
  const q = search.q?.slice(0, 80) ?? "";
  const resources = await listResources(
    db,
    user.id,
    { q, groupId, kind, mine: search.mine === "1" },
    100,
  );
  const filtered = Boolean(q || groupId || kind || search.mine);

  return (
    <main id="main" className="app-page" tabIndex={-1}>
      <PageHeader
        kicker="Study library"
        title="Everything your groups"
        accent="shared."
      >
        <p>
          Notes, guides, practice problems and links from every group you’re in.
          Only group members can open them.
        </p>
      </PageHeader>

      <div className="split">
        <div className="split-main">
          <form
            className="library-search panel"
            action="/library"
            method="get"
            role="search"
          >
            <label className="search-field">
              <Icon name="search" size={18} />
              <span className="sr-only">Search the library</span>
              <SmoothInput
                className="field"
                type="search"
                name="q"
                defaultValue={q}
                placeholder="Search titles and notes"
                maxLength={80}
              />
            </label>
            <GlassSelect
              className="library-filter"
              ariaLabel="Group"
              name="group"
              defaultValue={groupId ?? ""}
              options={[
                { value: "", label: "All groups" },
                ...active.map((g) => ({
                  value: g.id,
                  label: `${g.courseCode} · ${g.name}`,
                })),
              ]}
            />
            <GlassSelect
              className="library-filter"
              ariaLabel="Type"
              name="kind"
              defaultValue={kind ?? ""}
              options={[
                { value: "", label: "All types" },
                ...RESOURCE_KINDS.map((k) => ({ value: k.id, label: k.label })),
              ]}
            />
            <label className="check">
              <input
                type="checkbox"
                name="mine"
                value="1"
                defaultChecked={search.mine === "1"}
              />{" "}
              Mine
            </label>
            <button className="button primary small" type="submit">
              Filter
            </button>
          </form>
          <Panel
            title={
              filtered
                ? `${resources.length} ${resources.length === 1 ? "result" : "results"}`
                : "Latest"
            }
            icon="library"
            id="library"
          >
            {resources.length ? (
              <ResourceList
                resources={resources}
                userId={user.id}
                ownerOf={
                  new Set(
                    active.filter((g) => g.myRole === "owner").map((g) => g.id),
                  )
                }
                showGroup
              />
            ) : active.length ? (
              <Empty
                title={
                  filtered ? "Nothing matches that" : "Your library is empty"
                }
                action={
                  filtered
                    ? { href: "/library", label: "Clear filters" }
                    : undefined
                }
              >
                {filtered
                  ? "Try fewer filters."
                  : "Share the first file or link with one of your groups."}
              </Empty>
            ) : (
              <Empty
                title="Join a group to use the library"
                action={{ href: "/groups", label: "Find a group" }}
              >
                Everything here is shared inside study groups.
              </Empty>
            )}
          </Panel>
        </div>
        {active.length ? (
          <aside className="split-side">
            <Panel title="Share something" icon="upload" id="share">
              <ResourceForm
                groups={active.map((g) => ({
                  id: g.id,
                  label: `${g.courseCode} · ${g.name}`,
                }))}
              />
            </Panel>
          </aside>
        ) : null}
      </div>
    </main>
  );
}
