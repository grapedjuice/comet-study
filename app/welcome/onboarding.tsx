"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { type FormEvent, useCallback, useState } from "react";
import CoursesManager, { type UserCourse } from "../account/courses-manager";

const STEPS = ["Your name", "Your courses", "Ready"] as const;

export default function Onboarding({
  initialName,
  initialCourses,
  termLabel,
}: {
  initialName: string;
  initialCourses: UserCourse[];
  termLabel: string;
}) {
  const router = useRouter();
  const reduced = useReducedMotion();
  const [step, setStep] = useState(initialName ? 1 : 0);
  const [direction, setDirection] = useState(1);
  const [name, setName] = useState(initialName);
  const [courses, setCourses] = useState(initialCourses);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const trackCourses = useCallback(
    (next: UserCourse[]) => setCourses(next),
    [],
  );

  const go = (next: number) => {
    setDirection(next > step ? 1 : -1);
    setError("");
    setStep(next);
  };

  async function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/v1/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error?.message ?? "Couldn’t save your name");
      setName(payload.data.name);
      go(1);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/v1/me/onboarding", { method: "POST" });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error?.message ?? "Couldn’t finish setup");
      router.push("/");
      router.refresh();
    } catch (caught) {
      setError((caught as Error).message);
      setBusy(false);
    }
  }

  const first = name.split(" ")[0];
  const slide = reduced
    ? {}
    : {
        initial: { opacity: 0, x: 60 * direction, filter: "blur(10px)" },
        animate: { opacity: 1, x: 0, filter: "blur(0px)" },
        exit: { opacity: 0, x: -60 * direction, filter: "blur(10px)" },
        transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] as const },
      };

  return (
    <div className="onboarding">
      <ol className="onboarding-steps" aria-label="Setup progress">
        {STEPS.map((label, index) => (
          <li
            key={label}
            className={index === step ? "current" : index < step ? "done" : ""}
            aria-current={index === step ? "step" : undefined}
          >
            <span>{index < step ? "✓" : index + 1}</span>
            {label}
          </li>
        ))}
      </ol>

      <AnimatePresence mode="wait" initial={false}>
        {step === 0 ? (
          <motion.form
            key="name"
            className="onboarding-card"
            onSubmit={saveName}
            {...slide}
          >
            <p className="section-kicker">Step 1 of 3</p>
            <h1>
              First, what should{" "}
              <em className="gradient-serif">classmates call you?</em>
            </h1>
            <p className="onboarding-lede">
              Your first name is perfect. It’s what your study group will see.
            </p>
            <label className="field-label" htmlFor="display-name">
              Your name
            </label>
            <input
              id="display-name"
              className="field large"
              autoComplete="given-name"
              maxLength={40}
              placeholder="Alex"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
              required
            />
            <div className="onboarding-actions">
              <button
                className="button primary"
                type="submit"
                disabled={busy || !name.trim()}
              >
                {busy ? "Saving…" : "Continue"}{" "}
                <span aria-hidden="true">→</span>
              </button>
            </div>
          </motion.form>
        ) : step === 1 ? (
          <motion.div key="courses" className="onboarding-wide" {...slide}>
            <div className="onboarding-intro">
              <p className="section-kicker">Step 2 of 3</p>
              <h1>
                Nice to meet you, {first}.{" "}
                <em className="gradient-serif">What are you taking?</em>
              </h1>
              <p className="onboarding-lede">
                Add your {termLabel} courses — search the UTD catalog or paste
                your schedule from Orion. Pick your section if you know it to
                find classmates in the same room.
              </p>
            </div>
            <CoursesManager
              initialCourses={courses}
              termLabel={termLabel}
              onCoursesChange={trackCourses}
            />
            <div className="onboarding-actions">
              <button
                type="button"
                className="button ghost"
                onClick={() => go(0)}
              >
                ← Back
              </button>
              <button
                type="button"
                className="button primary"
                disabled={!courses.length}
                onClick={() => go(2)}
              >
                {courses.length
                  ? `Continue with ${courses.length} course${courses.length === 1 ? "" : "s"}`
                  : "Add a course to continue"}{" "}
                <span aria-hidden="true">→</span>
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div key="ready" className="onboarding-card ready" {...slide}>
            <span className="sent-orb" aria-hidden="true">
              ✦
            </span>
            <p className="section-kicker">Step 3 of 3</p>
            <h1>
              You’re all set, <em className="gradient-serif">{first}.</em>
            </h1>
            <p className="onboarding-lede">
              Your study table is ready. Here’s where you’re starting this term:
            </p>
            <ul className="ready-courses">
              {courses.map((course) => (
                <li key={course.id}>
                  <strong>{course.code}</strong>
                  <span>{course.title}</span>
                  <em>
                    {course.classmates
                      ? `${course.classmates} classmate${course.classmates === 1 ? "" : "s"} here`
                      : "You’re first"}
                  </em>
                </li>
              ))}
            </ul>
            <div className="onboarding-actions">
              <button
                type="button"
                className="button ghost"
                onClick={() => go(1)}
              >
                ← Edit courses
              </button>
              <button
                type="button"
                className="button primary large"
                disabled={busy}
                onClick={finish}
              >
                {busy ? "Opening…" : "Enter my study table"}{" "}
                <span aria-hidden="true">→</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <p className="courses-notice error" role="alert">
        {error}
      </p>
    </div>
  );
}
