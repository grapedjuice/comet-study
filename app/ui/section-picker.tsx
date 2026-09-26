"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";

type Section = {
  id: string;
  number: string;
  schedule: string | null;
  instructor: string | null;
  mode: string | null;
};

async function call<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const payload = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(payload?.error?.message ?? "Something went wrong");
  return payload.data as T;
}

/**
 * Set or change the section of a course the student already has. Opens in
 * place, lists this term's sections (flagging ones with exams listed) and
 * saves through the same endpoint as adding a course, which updates it.
 */
export function SectionPicker<T = unknown>({
  code,
  current,
  flagged = [],
  flagLabel = "Exams listed",
  trigger,
  onSaved,
  defaultOpen = false,
}: {
  code: string;
  current: string | null;
  flagged?: string[];
  flagLabel?: string;
  trigger?: string;
  onSaved?: (courses: T[]) => void;
  defaultOpen?: boolean;
}) {
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(defaultOpen);
  const [sections, setSections] = useState<Section[] | null>(null);
  const [choice, setChoice] = useState(current ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const flags = new Set(flagged.map((s) => s.toUpperCase()));

  useEffect(() => {
    if (!open || sections) return;
    let live = true;
    call<{ sections: Section[] }>(
      `/api/v1/courses/sections?code=${encodeURIComponent(code)}`,
    )
      .then((data) => live && setSections(data.sections))
      .catch((failure: Error) => {
        if (!live) return;
        setSections([]);
        setError(failure.message);
      });
    return () => {
      live = false;
    };
  }, [open, sections, code]);

  async function save() {
    if (!choice) return;
    setSaving(true);
    setError(null);
    try {
      const data = await call<{ courses: T[]; sectionMissing: string[] }>(
        "/api/v1/me/courses",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            courses: [{ code, section: choice }],
            source: "search",
          }),
        },
      );
      if (data.sectionMissing.length)
        throw new Error(`Section ${choice} isn’t listed for ${code} this term`);
      onSaved?.(data.courses);
      setOpen(false);
      router.refresh();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setSaving(false);
    }
  }

  // Sections with exams listed first, then in order.
  const ordered = [...(sections ?? [])].sort(
    (a, b) =>
      Number(flags.has(b.number.toUpperCase())) -
        Number(flags.has(a.number.toUpperCase())) ||
      a.number.localeCompare(b.number),
  );

  return (
    <div className={`sp${open ? " is-open" : ""}`}>
      {!open ? (
        <button
          type="button"
          className={`sp-trigger${current ? "" : " is-empty"}`}
          aria-expanded={false}
          aria-controls={id}
          onClick={() => setOpen(true)}
        >
          <span className="sp-plus" aria-hidden="true">
            {current ? "↻" : "+"}
          </span>
          {trigger ?? (current ? "Change section" : "Add section")}
        </button>
      ) : null}
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            id={id}
            className="sp-panel"
            initial={{ opacity: 0, height: 0, filter: "blur(6px)" }}
            animate={{ opacity: 1, height: "auto", filter: "blur(0px)" }}
            exit={{ opacity: 0, height: 0, filter: "blur(6px)" }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="sp-inner">
              <p className="sp-title">Which {code} section are you in?</p>
              {sections === null ? (
                <div className="sp-loading" aria-live="polite">
                  <i />
                  <i />
                  <i />
                  <span className="sr-only">Loading sections…</span>
                </div>
              ) : ordered.length ? (
                <div
                  className="sp-grid"
                  role="radiogroup"
                  aria-label={`${code} sections`}
                  data-lenis-prevent
                >
                  {ordered.map((section, i) => {
                    const flaggedSection = flags.has(
                      section.number.toUpperCase(),
                    );
                    return (
                      <motion.label
                        key={section.id}
                        className={`sp-option${choice === section.number ? " is-on" : ""}`}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                          delay: Math.min(i, 12) * 0.03,
                          duration: 0.35,
                          ease: [0.16, 1, 0.3, 1],
                        }}
                      >
                        <input
                          type="radio"
                          name={`${id}-section`}
                          value={section.number}
                          checked={choice === section.number}
                          onChange={() => setChoice(section.number)}
                        />
                        <span className="sp-num">.{section.number}</span>
                        <span className="sp-detail">
                          <span>
                            {section.schedule ?? section.mode ?? "Time TBA"}
                          </span>
                          {section.instructor ? (
                            <em>{section.instructor}</em>
                          ) : null}
                        </span>
                        {flaggedSection ? (
                          <span className="sp-flag">{flagLabel}</span>
                        ) : null}
                      </motion.label>
                    );
                  })}
                </div>
              ) : (
                <p className="sp-empty">
                  {error ?? `No ${code} sections are listed for this term.`}
                </p>
              )}
              {error && ordered.length ? (
                <p className="sp-error" role="alert">
                  {error}
                </p>
              ) : null}
              <div className="sp-actions">
                <button
                  type="button"
                  className="button ghost small"
                  onClick={() => {
                    setOpen(false);
                    setError(null);
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="button primary small"
                  disabled={!choice || choice === current || saving}
                  onClick={save}
                >
                  {saving
                    ? "Saving…"
                    : choice && choice !== current
                      ? `Save section .${choice}`
                      : "Pick a section"}
                </button>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
