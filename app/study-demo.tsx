"use client";

import { useEffect, useState } from "react";
import { stagger, useAnimate, useReducedMotion } from "motion/react";

type DemoCourse = {
  code: string;
  title: string;
  topic: string;
  people: string[][];
  slots: { day: string; time: string; cell: number }[];
  available: number[];
  groupLabel?: string;
  partners?: number;
};

export type PersonalCourse = {
  code: string;
  title: string;
  sectionNumber: string | null;
  schedule: string | null;
  classmates: number;
};

// Deliberately fictional fixtures. No provider calls, real students, or bookings.
const fixtures: DemoCourse[] = [
  {
    code: "CS 2336",
    title: "Computer Science II",
    topic: "Recursion, without the spiral.",
    people: [
      ["AJ", "Alex", "Practice problems"],
      ["MR", "Morgan", "Talk it through"],
      ["SK", "Sam", "Practice problems"],
    ],
    slots: [
      { day: "Wed", time: "3–4 pm", cell: 7 },
      { day: "Fri", time: "2–3 pm", cell: 4 },
    ],
    available: [0, 2, 4, 6, 7, 11, 12],
  },
  {
    code: "MATH 2414",
    title: "Integral Calculus",
    topic: "A fresh angle on integrals.",
    people: [
      ["JL", "Jamie", "Work examples"],
      ["RT", "Riley", "Compare notes"],
      ["CP", "Casey", "Work examples"],
    ],
    slots: [
      { day: "Tue", time: "4–5 pm", cell: 11 },
      { day: "Thu", time: "3–4 pm", cell: 8 },
    ],
    available: [1, 3, 5, 8, 9, 11, 14],
  },
  {
    code: "PHYS 2325",
    title: "University Physics I",
    topic: "Let’s work through the forces.",
    people: [
      ["TM", "Taylor", "Draw it out"],
      ["JD", "Jordan", "Practice problems"],
      ["AL", "Avery", "Compare notes"],
    ],
    slots: [
      { day: "Mon", time: "2–3 pm", cell: 0 },
      { day: "Thu", time: "4–5 pm", cell: 13 },
    ],
    available: [0, 3, 5, 7, 10, 12, 13],
  },
];

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return (
    (parts[0]?.[0] ?? "Y") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")
  ).toUpperCase();
}

/**
 * A signed-in student's real courses on the study table. Classmates appear as
 * a count only (no names yet); meeting times stay labeled samples until
 * availability sharing exists.
 */
function personalCourses(name: string, list: PersonalCourse[]): DemoCourse[] {
  return list.map((course, index) => {
    const sample = fixtures[index % fixtures.length];
    const shown = Math.min(course.classmates, 3);
    const people = [
      [
        initials(name),
        `${name.split(" ")[0]} (you)`,
        course.sectionNumber ? `Section ${course.sectionNumber}` : "Your seat",
      ],
      ...Array.from({ length: shown }, () => [
        "··",
        "Classmate",
        "On Comet Study",
      ]),
    ];
    if (!shown)
      people.push(["+", "Invite a classmate", "Groups form as people join"]);
    return {
      code: course.code,
      title: course.title,
      topic: `Let’s get ahead in ${course.title}.`,
      people,
      slots: sample.slots,
      available: sample.available,
      groupLabel: course.classmates
        ? `${course.classmates} classmate${course.classmates === 1 ? "" : "s"} joined`
        : "Your group starts here",
      partners: 1 + shown,
    };
  });
}

export function StudyDemo({
  personal,
}: {
  personal?: { name: string; courses: PersonalCourse[] };
}) {
  const courses =
    personal && personal.courses.length
      ? personalCourses(personal.name, personal.courses)
      : fixtures;
  const mine = courses !== fixtures;
  const [courseIndex, setCourseIndex] = useState(0);
  const [slotIndex, setSlotIndex] = useState(0);
  const [proposed, setProposed] = useState(false);
  const [scope, animate] = useAnimate();
  const reduced = useReducedMotion();
  const course = courses[courseIndex];
  const slot = course.slots[slotIndex];
  useEffect(() => {
    if (reduced) return;
    const animation = animate(
      "[data-demo-stage]",
      { opacity: [0, 1], y: [14, 0], filter: ["blur(6px)", "blur(0px)"] },
      { duration: 0.55, delay: stagger(0.08), ease: [0.16, 1, 0.3, 1] },
    );
    return () => animation.stop();
  }, [courseIndex, animate, reduced]);
  useEffect(() => {
    if (reduced) return;
    const animation = animate(
      ".session-proposal",
      { opacity: [0.5, 1], scale: [0.98, 1] },
      { duration: 0.4, ease: [0.16, 1, 0.3, 1] },
    );
    return () => animation.stop();
  }, [slotIndex, proposed, animate, reduced]);

  return (
    <section
      className="study-demo"
      id="demo"
      aria-labelledby="demo-title"
      ref={scope}
      tabIndex={-1}
    >
      <div className="demo-toolbar">
        <span className="window-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="demo-brand">
          {mine
            ? `${personal?.name.split(" ")[0]}’s study table`
            : "The study table"}
        </span>
        <span className="demo-label">
          <i aria-hidden="true" /> {mine ? "Your courses" : "Interactive demo"}
        </span>
      </div>
      <div className="demo-body">
        <div className="demo-side">
          <div className="demo-heading">
            <h2 id="demo-title">Your course. Your crew.</h2>
            <p>
              {mine
                ? "Pick one of your courses. See a plan come together."
                : "Choose a course. See a plan come together."}
            </p>
          </div>
          <div
            className="course-switcher"
            role="group"
            aria-label="Choose a demo course"
          >
            {courses.map((item, index) => (
              <button
                key={item.code}
                type="button"
                aria-pressed={courseIndex === index}
                onClick={() => {
                  setCourseIndex(index);
                  setSlotIndex(0);
                  setProposed(false);
                }}
              >
                {item.code}
              </button>
            ))}
          </div>
          <div className="demo-group" data-demo-stage>
            <div className="demo-section-heading">
              <h3>{course.title}</h3>
              <span>{course.groupLabel ?? "Example group"}</span>
            </div>
            <ul className="classmates">
              {course.people.map(([badge, name, style], index) => (
                <li className="classmate" key={`${index}-${name}`}>
                  <span className={`avatar tone-${index}`} aria-hidden="true">
                    {badge}
                  </span>
                  <strong>{name}</strong>
                  <span>{style}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="demo-main">
          <div className="demo-availability" data-demo-stage>
            <div className="demo-section-heading">
              <h3>A little common ground</h3>
              {mine ? <span>Sample times</span> : null}
              <span className="legend">
                <i aria-hidden="true" /> Shared time
              </span>
            </div>
            <table
              className="availability-table"
              aria-label={`Illustrative availability for ${course.code}; check marks mean everyone is free`}
            >
              <thead>
                <tr>
                  <th scope="col">
                    <span className="sr-only">Time</span>
                  </th>
                  {["Mon", "Tue", "Wed", "Thu", "Fri"].map((day) => (
                    <th scope="col" key={day}>
                      {day}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {["2 pm", "3 pm", "4 pm"].map((time, row) => (
                  <tr key={time}>
                    <th scope="row">{time}</th>
                    {[0, 1, 2, 3, 4].map((col) => {
                      const cell = row * 5 + col;
                      const overlap = course.slots.some(
                        (item) => item.cell === cell,
                      );
                      const partial = course.available.includes(cell);
                      return (
                        <td key={col}>
                          <span
                            className={`availability-cell ${overlap ? "overlap" : partial ? "partial" : ""} ${slot.cell === cell ? "selected-cell" : ""}`}
                          >
                            <span className="sr-only">
                              {overlap
                                ? "Everyone free"
                                : partial
                                  ? "Some available"
                                  : "No overlap"}
                              {slot.cell === cell ? ", selected" : ""}
                            </span>
                            {overlap ? <span aria-hidden="true">✓</span> : null}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <div
              className="slot-options"
              role="group"
              aria-label="Choose a demo session time"
            >
              {course.slots.map((item, index) => (
                <button
                  type="button"
                  key={item.day}
                  aria-pressed={slotIndex === index}
                  onClick={() => {
                    setSlotIndex(index);
                    setProposed(false);
                  }}
                >
                  <span className="slot-dot" aria-hidden="true" />
                  {item.day}, {item.time}
                </button>
              ))}
            </div>
          </div>
          <div className="proposal-row" data-demo-stage>
            <div
              className={`session-proposal ${proposed ? "is-proposed" : ""}`}
            >
              <div className="session-day">
                <span>{slot.day}</span>
                <strong>{slot.time.split("–")[0]}</strong>
                <span>pm</span>
              </div>
              <div className="session-details">
                <p>
                  {proposed ? "Proposed in demo" : "Your possible next session"}
                </p>
                <h3>{course.topic}</h3>
                <span>
                  {slot.time} · {course.partners ?? 4} study partner
                  {(course.partners ?? 4) === 1 ? "" : "s"}, including you
                </span>
              </div>
            </div>
            <button
              className="demo-propose"
              type="button"
              onClick={() => setProposed(!proposed)}
            >
              {proposed ? "Reset proposal" : "Try proposing this time"}
              <span aria-hidden="true">{proposed ? "↺" : "→"}</span>
            </button>
          </div>
        </div>
      </div>
      <p role="status" className="sr-only">
        {course.code}: {course.people.map((person) => person[1]).join(", ")}.
        Shared time {slot.day}, {slot.time}.{" "}
        {proposed
          ? "Proposed in demo. Nothing was booked or sent."
          : "Example session selected."}
      </p>
      <p className="demo-disclaimer">
        {mine
          ? "Classmates are shown by count only. Times are samples until availability sharing opens. Nothing is booked or sent."
          : "Fictional classmates & times. Nothing is booked or sent."}
      </p>
      <noscript>
        <p className="demo-nojs">
          Enable JavaScript to try the course and time selectors. The example
          above shows CS 2336.
        </p>
      </noscript>
    </section>
  );
}
