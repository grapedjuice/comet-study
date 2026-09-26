"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SectionPicker } from "./section-picker";
import { SmoothInput } from "./smooth-input";

export type UserCourse = {
  id: string;
  code: string;
  title: string;
  sectionNumber: string | null;
  schedule: string | null;
  instructor: string | null;
  classmates: number;
  sectionmates: number;
};
type CatalogCourse = {
  code: string;
  title: string;
  creditHours: string | null;
};
type Section = {
  id: string;
  number: string;
  schedule: string | null;
  instructor: string | null;
  mode: string | null;
};
type Found = {
  code: string;
  title: string;
  section: string | null;
  schedule: string | null;
  instructor: string | null;
  verifiedSection: boolean;
};

const MAX = 12;
const json = { "Content-Type": "application/json" };

async function call<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const payload = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(payload?.error?.message ?? "Something went wrong");
  return payload.data as T;
}

function classmatesLine(course: UserCourse) {
  if (!course.classmates)
    return "You’re the first here — groups form as classmates join";
  const people = `${course.classmates} classmate${course.classmates === 1 ? "" : "s"} on Comet Study`;
  return course.sectionmates
    ? `${people} · ${course.sectionmates} in your section`
    : people;
}

export default function CoursesManager({
  initialCourses,
  termLabel,
  onCoursesChange,
  refreshOnChange = false,
}: {
  initialCourses: UserCourse[];
  termLabel: string;
  onCoursesChange?: (courses: UserCourse[]) => void;
  /** Re-render the server page after a change (e.g. its exam schedule). */
  refreshOnChange?: boolean;
}) {
  const router = useRouter();
  const [courses, setCourses] = useState(initialCourses);
  useEffect(() => {
    onCoursesChange?.(courses);
  }, [courses, onCoursesChange]);
  const [tab, setTab] = useState<"search" | "import">("search");
  const [notice, setNotice] = useState<{
    kind: "ok" | "error";
    text: string;
  } | null>(null);

  // Search
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CatalogCourse[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<CatalogCourse | null>(null);
  const [sections, setSections] = useState<Section[] | null>(null);
  const [sectionChoice, setSectionChoice] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const searchId = useRef(0);

  // Import
  const [pasted, setPasted] = useState("");
  const [found, setFound] = useState<Found[] | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const id = ++searchId.current;
    const timer = setTimeout(() => {
      setSearching(true);
      call<{ results: CatalogCourse[] }>(
        `/api/v1/courses/search?q=${encodeURIComponent(q)}`,
      )
        .then((data) => id === searchId.current && setResults(data.results))
        .catch(
          (error: Error) =>
            id === searchId.current &&
            setNotice({ kind: "error", text: error.message }),
        )
        .finally(() => id === searchId.current && setSearching(false));
    }, 180);
    return () => clearTimeout(timer);
  }, [query]);

  async function pick(course: CatalogCourse) {
    setPicked(course);
    setSections(null);
    setSectionChoice("");
    setNotice(null);
    try {
      const data = await call<{ sections: Section[] }>(
        `/api/v1/courses/sections?code=${encodeURIComponent(course.code)}`,
      );
      setSections(data.sections);
    } catch (error) {
      setSections([]);
      setNotice({ kind: "error", text: (error as Error).message });
    }
  }

  async function add(
    items: { code: string; section?: string | null }[],
    source: "search" | "import",
  ) {
    setSaving(true);
    setNotice(null);
    try {
      const data = await call<{
        courses: UserCourse[];
        unknown: string[];
        sectionMissing: string[];
      }>("/api/v1/me/courses", {
        method: "POST",
        headers: json,
        body: JSON.stringify({ courses: items, source }),
      });
      setCourses(data.courses);
      if (refreshOnChange) router.refresh();
      const extra = data.sectionMissing.length
        ? ` Couldn’t match section ${data.sectionMissing.join(", ")} for this term, so it was added without one.`
        : "";
      setNotice({
        kind: "ok",
        text: `Added ${items.length === 1 ? items[0].code : `${items.length} courses`}.${extra}`,
      });
      return true;
    } catch (error) {
      setNotice({ kind: "error", text: (error as Error).message });
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function remove(course: UserCourse) {
    setNotice(null);
    try {
      await call(`/api/v1/me/courses/${course.id}`, { method: "DELETE" });
      setCourses((current) => current.filter((item) => item.id !== course.id));
      if (refreshOnChange) router.refresh();
      setNotice({ kind: "ok", text: `Removed ${course.code}.` });
    } catch (error) {
      setNotice({ kind: "error", text: (error as Error).message });
    }
  }

  async function detect() {
    setNotice(null);
    setFound(null);
    setSaving(true);
    try {
      const data = await call<{ found: Found[] }>("/api/v1/me/courses/import", {
        method: "POST",
        headers: json,
        body: JSON.stringify({ text: pasted }),
      });
      setFound(data.found);
      setChosen(new Set(data.found.map((item) => item.code)));
      if (!data.found.length)
        setNotice({
          kind: "error",
          text: "No UTD course codes found in that text. Try copying the whole schedule page.",
        });
    } catch (error) {
      setNotice({ kind: "error", text: (error as Error).message });
    } finally {
      setSaving(false);
    }
  }

  const full = courses.length >= MAX;

  return (
    <div className="courses">
      <section className="courses-list" aria-labelledby="courses-title">
        <div className="courses-head">
          <div>
            <p className="section-kicker">{termLabel}</p>
            <h2 id="courses-title">Your courses</h2>
          </div>
          <span className="courses-count">
            {courses.length} / {MAX}
          </span>
        </div>
        {courses.length ? (
          <ul>
            <AnimatePresence initial={false}>
              {courses.map((course) => (
                <motion.li
                  key={course.id}
                  className="course-card"
                  layout
                  initial={{ opacity: 0, y: 16, filter: "blur(6px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, scale: 0.96, filter: "blur(6px)" }}
                  transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                >
                  <div className="course-card-main">
                    <p className="course-card-code">
                      {course.code}
                      {course.sectionNumber ? (
                        <span>.{course.sectionNumber}</span>
                      ) : null}
                    </p>
                    <h3>{course.title}</h3>
                    {course.schedule || course.instructor ? (
                      <p className="course-card-meta">
                        {[course.schedule, course.instructor]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    ) : null}
                    <p
                      className={`course-card-people${course.classmates ? " has-people" : ""}`}
                    >
                      <i aria-hidden="true" /> {classmatesLine(course)}
                    </p>
                    <SectionPicker<UserCourse>
                      key={course.sectionNumber ?? "none"}
                      code={course.code}
                      current={course.sectionNumber}
                      onSaved={setCourses}
                    />
                  </div>
                  <button
                    type="button"
                    className="course-remove"
                    aria-label={`Remove ${course.code}`}
                    onClick={() => remove(course)}
                  >
                    ×
                  </button>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        ) : (
          <div className="courses-empty">
            <p>No courses yet.</p>
            <span>
              Search the UTD catalog or paste your schedule from Orion to get
              started.
            </span>
          </div>
        )}
      </section>

      <section className="courses-add" aria-labelledby="add-title">
        <h2 id="add-title" className="sr-only">
          Add courses
        </h2>
        <div
          className="courses-tabs"
          role="tablist"
          aria-label="How to add courses"
        >
          {(
            [
              ["search", "Search the catalog"],
              ["import", "Import from Orion"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              id={`tab-${key}`}
              aria-selected={tab === key}
              aria-controls={`panel-${key}`}
              onClick={() => {
                setTab(key);
                setNotice(null);
              }}
            >
              {tab === key ? (
                <motion.span
                  layoutId="courses-tab-pill"
                  className="courses-tab-pill"
                  aria-hidden="true"
                  transition={{ type: "spring", stiffness: 460, damping: 36 }}
                />
              ) : null}
              {label}
            </button>
          ))}
        </div>

        {tab === "search" ? (
          <motion.div
            key="search"
            role="tabpanel"
            id="panel-search"
            aria-labelledby="tab-search"
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          >
            <label className="field-label" htmlFor="course-search">
              Course code or title
            </label>
            <SmoothInput
              id="course-search"
              className="field"
              type="search"
              autoComplete="off"
              placeholder="CS 2336, calculus, MATH 24…"
              value={query}
              disabled={full}
              onChange={(event) => {
                setQuery(event.target.value);
                setPicked(null);
                if (event.target.value.trim().length < 2) setResults([]);
              }}
            />
            {full ? (
              <p className="field-hint">
                You’ve reached {MAX} courses for this term.
              </p>
            ) : null}
            {!picked && query.trim().length >= 2 ? (
              <ul
                className="search-results"
                aria-label="Matching courses"
                aria-busy={searching}
              >
                {results.map((course) => (
                  <li key={course.code}>
                    <button type="button" onClick={() => pick(course)}>
                      <strong>{course.code}</strong>
                      <span>{course.title}</span>
                    </button>
                  </li>
                ))}
                {!searching && !results.length ? (
                  <li className="search-empty">
                    No UTD courses match “{query.trim()}”.
                  </li>
                ) : null}
              </ul>
            ) : null}
            {picked ? (
              <div className="section-picker">
                <div className="section-picker-head">
                  <div>
                    <strong>{picked.code}</strong> <span>{picked.title}</span>
                  </div>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setPicked(null)}
                  >
                    Change
                  </button>
                </div>
                <fieldset>
                  <legend>Which section are you in?</legend>
                  {sections === null ? (
                    <p className="field-hint">Loading this term’s sections…</p>
                  ) : (
                    <div className="section-options">
                      {sections.map((section) => (
                        <label key={section.id} className="section-option">
                          <input
                            type="radio"
                            name="section"
                            value={section.number}
                            checked={sectionChoice === section.number}
                            onChange={() => setSectionChoice(section.number)}
                          />
                          <span className="section-number">
                            {section.number}
                          </span>
                          <span className="section-detail">
                            {section.schedule ?? section.mode ?? "Time TBA"}
                            {section.instructor ? (
                              <em>{section.instructor}</em>
                            ) : null}
                          </span>
                        </label>
                      ))}
                      <label className="section-option">
                        <input
                          type="radio"
                          name="section"
                          value=""
                          checked={sectionChoice === ""}
                          onChange={() => setSectionChoice("")}
                        />
                        <span className="section-number">—</span>
                        <span className="section-detail">
                          {sections.length
                            ? "Not sure yet / skip"
                            : "No sections listed this term — add without one"}
                        </span>
                      </label>
                    </div>
                  )}
                </fieldset>
                <button
                  type="button"
                  className="button primary"
                  disabled={saving}
                  onClick={async () => {
                    if (
                      await add(
                        [{ code: picked.code, section: sectionChoice || null }],
                        "search",
                      )
                    ) {
                      setPicked(null);
                      setQuery("");
                      setResults([]);
                    }
                  }}
                >
                  {saving ? "Adding…" : `Add ${picked.code}`}{" "}
                  <span aria-hidden="true">→</span>
                </button>
              </div>
            ) : null}
          </motion.div>
        ) : (
          <motion.div
            key="import"
            role="tabpanel"
            id="panel-import"
            aria-labelledby="tab-import"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          >
            <ol className="import-steps">
              <li>
                In <strong>Orion</strong>, open your class schedule (
                <em>View My Classes</em> or <em>My Class Schedule</em>) — or
                your Schedule Planner cart.
              </li>
              <li>
                Select everything on the page (<kbd>Ctrl</kbd>+<kbd>A</kbd>),
                copy, and paste it below.
              </li>
            </ol>
            <label className="field-label" htmlFor="schedule-paste">
              Your class schedule
            </label>
            <textarea
              id="schedule-paste"
              className="field"
              rows={6}
              placeholder={
                "CS 2336 - Computer Science II\n80049  002  Lecture  MoWe 10:00AM…"
              }
              value={pasted}
              onChange={(event) => {
                setPasted(event.target.value);
                setFound(null);
              }}
            />
            <button
              type="button"
              className="button ghost"
              disabled={saving || !pasted.trim()}
              onClick={detect}
            >
              {saving && !found ? "Reading…" : "Find my courses"}
            </button>
            {found?.length ? (
              <div className="import-found">
                <p className="field-label">
                  Found {found.length} UTD course{found.length === 1 ? "" : "s"}
                </p>
                <ul>
                  {found.map((item) => (
                    <li key={item.code}>
                      <label>
                        <input
                          type="checkbox"
                          checked={chosen.has(item.code)}
                          onChange={(event) => {
                            const next = new Set(chosen);
                            if (event.target.checked) next.add(item.code);
                            else next.delete(item.code);
                            setChosen(next);
                          }}
                        />
                        <strong>
                          {item.code}
                          {item.section ? `.${item.section}` : ""}
                        </strong>
                        <span>
                          {item.title}
                          {item.schedule ? <em>{item.schedule}</em> : null}
                        </span>
                        {item.section && item.verifiedSection ? (
                          <b className="verified">Section verified</b>
                        ) : null}
                      </label>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="button primary"
                  disabled={saving || !chosen.size}
                  onClick={async () => {
                    const items = found
                      .filter((item) => chosen.has(item.code))
                      .map((item) => ({
                        code: item.code,
                        section: item.section,
                      }));
                    if (await add(items, "import")) {
                      setFound(null);
                      setPasted("");
                    }
                  }}
                >
                  Add {chosen.size} course{chosen.size === 1 ? "" : "s"}{" "}
                  <span aria-hidden="true">→</span>
                </button>
              </div>
            ) : null}
            <p className="field-hint">
              Only the courses you choose are saved — the pasted text never is.
            </p>
          </motion.div>
        )}
        <p className={`courses-notice ${notice?.kind ?? ""}`} role="status">
          {notice?.text}
        </p>
      </section>
    </div>
  );
}
