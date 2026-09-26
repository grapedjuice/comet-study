"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import {
  addDays,
  campusDate,
  campusToUtc,
  formatDay,
  formatTimeRange,
  relativeDay,
} from "@/lib/time";
import { SectionPicker } from "../../ui/section-picker";
import { SlidingNumber } from "../../ui/sliding-number";

/*
 * Exam schedule, rebuilt from two 21st.dev pieces without Tailwind:
 * "Event Countdown Card" (isaiahbjork) for the next exam — live D/H/M/S
 * tiles with a pulsing seconds unit — and "Changelog" (thegridcn) for the
 * rest: a glowing rail, typed tags and a staggered reveal.
 */

export type ScheduleExam = {
  id: string;
  courseCode: string;
  sectionNumber: string | null;
  kind: "final" | "midterm" | "quiz";
  label: string;
  startsAt: string;
  endsAt: string;
  location: string | null;
  allDay: boolean;
  openDates: string[] | null;
  bookingUrl: string | null;
  source: "registrar" | "department" | "testing-center";
};

export type ScheduleWindow = {
  label: string;
  startsOn: string;
  endsOn: string;
};
export type SectionNeeded = { code: string; sections: string[] };

const SOURCE: Record<ScheduleExam["source"], string> = {
  registrar: "Registrar",
  "testing-center": "Testing Center",
  department: "Room booked",
};
const KIND: Record<ScheduleExam["kind"], string> = {
  final: "Final",
  midterm: "Exam",
  quiz: "Quiz",
};

const noon = (date: string) => campusToUtc(date, "12:00")!;
const dayOf = (date: string) => formatDay(noon(date));
const monthFmt = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "America/Chicago",
});

function lastDay(exam: ScheduleExam) {
  return addDays(campusDate(new Date(exam.endsAt)), -1);
}

function when(exam: ScheduleExam) {
  const start = new Date(exam.startsAt);
  if (!exam.allDay) return formatTimeRange(start, new Date(exam.endsAt));
  const first = campusDate(start);
  const last = lastDay(exam);
  return first === last
    ? "Any time that day"
    : `${dayOf(first).split(", ")[1]} – ${dayOf(last).split(", ")[1]}`;
}

function openDays(dates: string[]) {
  return dates.map((d) => ({
    key: d,
    weekday: dayOf(d).split(",")[0],
    day: Number(d.slice(8)),
  }));
}

function useNow(initial: string) {
  const [now, setNow] = useState(() => Date.parse(initial));
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function Countdown({ exam, now }: { exam: ScheduleExam; now: number }) {
  const start = Date.parse(exam.startsAt);
  const end = Date.parse(exam.endsAt);
  const open = exam.allDay && start <= now && now < end;
  const target = open ? end : start;
  const left = Math.max(0, Math.floor((target - now) / 1000));
  const units = [
    { label: "Days", value: Math.floor(left / 86400) },
    { label: "Hours", value: Math.floor((left % 86400) / 3600) },
    { label: "Min", value: Math.floor((left % 3600) / 60) },
    { label: "Sec", value: left % 60 },
  ];
  const caption = open
    ? "left to take it"
    : exam.allDay
      ? "until it opens"
      : "until it starts";
  return (
    <div
      className="xs-count"
      role="timer"
      aria-label={`${units[0].value} days ${units[1].value} hours ${caption}`}
    >
      <div className="xs-count-tiles" aria-hidden="true">
        {units.map((unit) => (
          <div key={unit.label} className="xs-tile">
            <strong>
              <SlidingNumber value={unit.value} pad={2} />
            </strong>
            <span>{unit.label}</span>
          </div>
        ))}
      </div>
      <p className="xs-count-caption">
        {left < 86400 && left > 0 ? (
          <span className="xs-soon">
            {open ? "Last day" : "Tomorrow or sooner"}
          </span>
        ) : null}
        {caption}
      </p>
    </div>
  );
}

function Hero({ exam, now }: { exam: ScheduleExam; now: number }) {
  const start = new Date(exam.startsAt);
  const first = campusDate(start);
  return (
    <motion.article
      className={`xs-hero kind-${exam.kind}`}
      initial={{ opacity: 0, y: 28, scale: 0.97, filter: "blur(8px)" }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
      transition={{ type: "spring", stiffness: 260, damping: 30, mass: 0.8 }}
    >
      <div className="xs-hero-aura" aria-hidden="true" />
      <div className="xs-hero-main">
        <div className="xs-tags">
          <span className="xs-next">
            <i aria-hidden="true" /> Up next
          </span>
          <span className={`xs-tag kind-${exam.kind}`}>{KIND[exam.kind]}</span>
          <span className="xs-src">{SOURCE[exam.source]}</span>
        </div>
        <h3 className="xs-hero-course">
          {exam.courseCode}
          {exam.sectionNumber ? <span>.{exam.sectionNumber}</span> : null}
        </h3>
        <p className="xs-hero-label">{exam.label}</p>
        <dl className="xs-hero-meta">
          <div>
            <dt>When</dt>
            <dd>
              {exam.allDay
                ? first === lastDay(exam)
                  ? dayOf(first)
                  : `${dayOf(first)} – ${dayOf(lastDay(exam))}`
                : `${formatDay(start)} · ${when(exam)}`}
            </dd>
          </div>
          {exam.location ? (
            <div>
              <dt>Where</dt>
              <dd>{exam.location}</dd>
            </div>
          ) : null}
        </dl>
        {exam.openDates?.length ? (
          <ul className="xs-days" aria-label="Days with open times">
            {openDays(exam.openDates).map((d) => (
              <li key={d.key}>
                <span>{d.weekday}</span>
                <strong>{d.day}</strong>
              </li>
            ))}
          </ul>
        ) : null}
        {exam.bookingUrl ? (
          <a
            className="button primary xs-cta"
            href={exam.bookingUrl}
            target="_blank"
            rel="noreferrer"
          >
            Book a time on RegisterBlast <span aria-hidden="true">↗</span>
          </a>
        ) : (
          <a className="button ghost xs-cta" href="/api/v1/me/calendar.ics">
            Add to my calendar <span aria-hidden="true">↓</span>
          </a>
        )}
      </div>
      <Countdown exam={exam} now={now} />
    </motion.article>
  );
}

export function ExamSchedule({
  exams,
  windows,
  needSection,
  noFinal,
  checked,
  now: initialNow,
  sources,
}: {
  exams: ScheduleExam[];
  windows: ScheduleWindow[];
  needSection: SectionNeeded[];
  noFinal: string[];
  checked: string | null;
  now: string;
  sources: { registrar: string; testingCenter: string };
}) {
  const reduce = useReducedMotion();
  const now = useNow(initialNow);
  const upcoming = exams.filter((e) => Date.parse(e.endsAt) > now);
  const [next, ...rest] = upcoming;
  const nowDate = new Date(now);

  // Group the rest of the timeline by month.
  const months: { label: string; items: ScheduleExam[] }[] = [];
  for (const exam of rest) {
    const label = monthFmt.format(new Date(exam.startsAt));
    const group = months.at(-1);
    if (group?.label === label) group.items.push(exam);
    else months.push({ label, items: [exam] });
  }

  return (
    <section className="xs panel" id="exams" aria-labelledby="exams-title">
      <header className="xs-head">
        <div>
          <p className="xs-kicker">Exam schedule</p>
          <h2 className="xs-title" id="exams-title">
            Every exam, <em>one timeline.</em>
          </h2>
        </div>
        {windows.length ? (
          <ul className="xs-windows" aria-label="Final exam periods">
            {windows.map((w) => (
              <li key={w.label} title={w.label}>
                <strong>
                  {dayOf(w.startsOn).split(", ")[1]} –{" "}
                  {dayOf(w.endsOn).split(", ")[1]}
                </strong>
                <span>
                  {/first 8/i.test(w.label) ? "8-week finals" : "Finals week"}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </header>

      {next ? <Hero exam={next} now={now} /> : null}

      {needSection.length ? (
        <div className="xs-unlock">
          <p className="xs-unlock-title">
            <span className="xs-lock" aria-hidden="true" />
            Pick your section to unlock its exams
          </p>
          <div className="xs-unlock-grid">
            {needSection.map((course) => (
              <div className="xs-unlock-card" key={course.code}>
                <div className="xs-unlock-head">
                  <strong>{course.code}</strong>
                  <span>
                    {course.sections.length
                      ? `${course.sections.length} ${course.sections.length === 1 ? "section has" : "sections have"} exams listed`
                      : "Needed to show your final"}
                  </span>
                </div>
                <SectionPicker
                  code={course.code}
                  current={null}
                  flagged={course.sections}
                  trigger="Choose section"
                />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {months.length ? (
        <div className="xs-timeline">
          {months.map((month) => (
            <div className="xs-month" key={month.label}>
              <p className="xs-month-label">{month.label}</p>
              <ol>
                {month.items.map((exam, i) => {
                  const start = new Date(exam.startsAt);
                  const [weekday, md] = formatDay(start).split(", ");
                  return (
                    <motion.li
                      key={exam.id}
                      className={`xs-item kind-${exam.kind}`}
                      initial={
                        reduce
                          ? false
                          : { opacity: 0, y: 12, filter: "blur(4px)" }
                      }
                      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                      viewport={{ once: true, margin: "-40px" }}
                      transition={{
                        delay: Math.min(i, 8) * 0.07,
                        duration: 0.5,
                        ease: [0.16, 1, 0.3, 1],
                      }}
                    >
                      <div className="xs-date">
                        <strong>{md.split(" ")[1]}</strong>
                        <span>{md.split(" ")[0]}</span>
                        <em>{weekday}</em>
                      </div>
                      <span className="xs-rail" aria-hidden="true">
                        <i />
                      </span>
                      <div className="xs-body">
                        <div className="xs-line">
                          <span className={`xs-tag kind-${exam.kind}`}>
                            {KIND[exam.kind]}
                          </span>
                          <span className="xs-when">{when(exam)}</span>
                          <span className="xs-rel">
                            {relativeDay(start, nowDate)}
                          </span>
                        </div>
                        <h4>
                          {exam.courseCode}
                          {exam.sectionNumber ? (
                            <span className="xs-sec">
                              .{exam.sectionNumber}
                            </span>
                          ) : null}{" "}
                          <span className="xs-label">{exam.label}</span>
                        </h4>
                        <p className="xs-meta">
                          {[
                            exam.location,
                            // "UTD Testing Center · Testing Center" says it twice.
                            exam.location?.includes(SOURCE[exam.source])
                              ? null
                              : SOURCE[exam.source],
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                          {exam.bookingUrl ? (
                            <>
                              {" · "}
                              <a
                                href={exam.bookingUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Book a time ↗
                              </a>
                            </>
                          ) : null}
                        </p>
                        {exam.openDates?.length ? (
                          <ul className="xs-days small">
                            {openDays(exam.openDates).map((d) => (
                              <li key={d.key}>
                                <span>{d.weekday}</span>
                                <strong>{d.day}</strong>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    </motion.li>
                  );
                })}
              </ol>
            </div>
          ))}
        </div>
      ) : !next ? (
        <div className="xs-empty">
          <span className="xs-empty-orb" aria-hidden="true" />
          <p>No exams on the calendar yet</p>
          <span>
            Finals show up once the registrar or Testing Center lists them.
          </span>
        </div>
      ) : null}

      <footer className="xs-foot">
        {noFinal.length ? (
          <p>
            No final listed for {noFinal.join(", ")}. Not every class has one;
            Orion shows yours under Manage My Classes → Exam Schedule.
          </p>
        ) : null}
        <p>
          From the{" "}
          <a href={sources.registrar} target="_blank" rel="noreferrer">
            UT Dallas registrar
          </a>
          , the{" "}
          <a href={sources.testingCenter} target="_blank" rel="noreferrer">
            Testing Center
          </a>{" "}
          and rooms departments book. Check Orion the week before finals in case
          a room changes.
          {checked ? ` Checked ${formatDay(new Date(checked))}.` : ""}
        </p>
      </footer>
    </section>
  );
}
