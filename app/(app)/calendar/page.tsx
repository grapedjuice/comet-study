import type { Metadata } from "next";
import Link from "next/link";
import { ViewTransition } from "react";
import { requireStudent } from "@/lib/app-session";
import { parseSchedule } from "@/lib/calendar";
import { listMyCampusExams } from "@/lib/campus-exams";
import { listUserCourses } from "@/lib/courses";
import { listMyExams, listMySessions } from "@/lib/sessions";
import {
  addDays,
  campusDate,
  campusMinutes,
  campusToUtc,
  campusWeekday,
  formatClock,
  formatDay,
  formatTimeRange,
  isDateString,
  TZ_LABEL,
  weekStart,
} from "@/lib/time";
import { PageHeader, SegPill } from "../ui/bits";
import {
  campusExamDays,
  campusExamSource,
  campusExamWhen,
} from "../ui/exam-bits";
import { Icon } from "../ui/icons";
import { MonthOverflow } from "../ui/month-overflow";
import { SpotlightGroup } from "../../ui/motion";

export const metadata: Metadata = { title: "Calendar — Comet Study" };

// The day's outer bounds (the month strip uses these). The week grid shows
// 8am–8pm, widened to fit anything earlier or later, so it fits a screen.
const START = 7 * 60;
const END = 23 * 60;
const monthFmt = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** "10–10:50am", or "11:30am–12:45pm" when the halves differ (like formatTimeRange). */
function clockRange(start: number, end: number) {
  const a = formatClock(start);
  const b = formatClock(end);
  return `${a.slice(-2) === b.slice(-2) ? a.slice(0, -2) : a}–${b}`;
}

/*
 * View transitions (a Link's transitionTypes → CSS in app.css): switching to
 * month pulls the camera back from the week's row, switching to week pushes
 * in on it, and prev/next slide the range sideways. "rN" is the week's row
 * in the month grid, so the zoom centers on it.
 */
const ROWS = [0, 1, 2, 3, 4, 5];
const STAGE = {
  "cal-prev": "slide-back",
  "cal-next": "slide-fwd",
  ...Object.fromEntries(
    ROWS.flatMap((r) => [
      [`cal-out-${r}`, `cal-out r${r}`],
      [`cal-in-${r}`, `cal-in r${r}`],
    ]),
  ),
  default: "none",
};
const TITLE = {
  "cal-prev": "title-back",
  "cal-next": "title-fwd",
  ...Object.fromEntries(
    ROWS.flatMap((r) => [
      [`cal-out-${r}`, "title-fade"],
      [`cal-in-${r}`, "title-fade"],
    ]),
  ),
  default: "none",
};
// Each course keeps one dot color across the month, in course-list order so
// up to six courses never share one (sessions and exams keep their own).
const COURSE_TONES = [
  "#6cc6ff",
  "#5eead4",
  "#b8adff",
  "#ffc38a",
  "#f5a8e8",
  "#8ee6a8",
];
const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

type Item = {
  key: string;
  kind: "class" | "session" | "exam";
  date: string;
  start: number;
  end: number;
  title: string;
  detail: string;
  href: string;
  cancelled?: boolean;
  allDay?: boolean;
};

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; at?: string }>;
}) {
  const { db, user, term } = await requireStudent();
  const search = await searchParams;
  const view = search.view === "month" ? "month" : "week";
  const today = campusDate(new Date());
  const anchor = isDateString(search.at) ? search.at : today;

  // Visible range: a Monday-start week, or the six weeks covering a month.
  const monthStart = `${anchor.slice(0, 7)}-01`;
  const first = view === "week" ? weekStart(anchor) : weekStart(monthStart);
  const days = Array.from({ length: view === "week" ? 7 : 42 }, (_, i) =>
    addDays(first, i),
  );
  const from = campusToUtc(days[0], "00:00")!;
  const to = campusToUtc(addDays(days.at(-1)!, 1), "00:00")!;

  const [courses, sessions, exams, campusExams] = await Promise.all([
    listUserCourses(db, user.id, term),
    listMySessions(db, user.id, from, to, { includeCancelled: true }),
    listMyExams(db, user.id, from, to),
    listMyCampusExams(db, user.id, from, to),
  ]);
  const blocks = courses.flatMap((c) => parseSchedule(c.code, c.schedule));
  const tones = new Map(
    courses
      .map((c) => c.code)
      .sort()
      .map((code, i) => [code, COURSE_TONES[i % COURSE_TONES.length]]),
  );
  const items: Item[] = [];
  for (const date of days) {
    const weekday = campusWeekday(campusToUtc(date, "12:00")!);
    for (const b of blocks)
      if (b.weekday === weekday)
        items.push({
          key: `c-${date}-${b.courseCode}-${b.start}`,
          kind: "class",
          date,
          start: b.start,
          end: b.end,
          title: b.courseCode,
          detail: `${clockRange(b.start, b.end)}${b.where ? ` · ${b.where}` : ""}`,
          href: "/courses",
        });
  }
  for (const s of sessions)
    items.push({
      key: `s-${s.id}`,
      kind: "session",
      date: campusDate(s.startsAt),
      start: campusMinutes(s.startsAt),
      end:
        campusDate(s.endsAt) === campusDate(s.startsAt)
          ? campusMinutes(s.endsAt)
          : 24 * 60,
      title: s.title,
      detail: `${formatTimeRange(s.startsAt, s.endsAt)} · ${s.groupName}${s.location ? ` · ${s.location}` : ""}`,
      href: `/groups/${s.groupId}?tab=sessions`,
      cancelled: s.status === "cancelled",
    });
  for (const e of exams)
    items.push({
      key: `e-${e.id}`,
      kind: "exam",
      date: campusDate(e.startsAt),
      start: campusMinutes(e.startsAt),
      end: e.endsAt ? campusMinutes(e.endsAt) : campusMinutes(e.startsAt) + 75,
      title: `${e.courseCode} ${e.label}`,
      detail: `${formatTimeRange(e.startsAt, e.endsAt ?? e.startsAt)} · ${e.badge}`,
      href: `/groups/${e.groupId}?tab=exams`,
    });
  for (const e of campusExams) {
    const title = `${e.courseCode} ${e.label}`;
    if (e.allDay) {
      // Testing Center exams: one all-day entry per day it can be taken.
      for (const date of campusExamDays(e))
        items.push({
          key: `u-${e.id}-${date}`,
          kind: "exam",
          date,
          start: 0,
          end: 0,
          allDay: true,
          title,
          detail: `${campusExamWhen(e)} · Testing Center, book a time`,
          href: "/courses#exams",
        });
      continue;
    }
    items.push({
      key: `u-${e.id}`,
      kind: "exam",
      date: campusDate(e.startsAt),
      start: campusMinutes(e.startsAt),
      end: campusMinutes(e.endsAt),
      title,
      detail: `${formatTimeRange(e.startsAt, e.endsAt)}${e.location ? ` · ${e.location}` : ""} · ${campusExamSource(e).label}`,
      href: "/courses#exams",
    });
  }
  items.sort((a, b) => a.start - b.start);
  const byDay = new Map<string, Item[]>();
  for (const item of items)
    byDay.set(item.date, [...(byDay.get(item.date) ?? []), item]);

  const step = view === "week" ? 7 : 0;
  const prev =
    view === "week" ? addDays(first, -step) : shiftMonth(monthStart, -1);
  const next =
    view === "week" ? addDays(first, step) : shiftMonth(monthStart, 1);
  // Which row of its month the anchor's week sits on (0–5).
  const row = daysBetween(weekStart(monthStart), weekStart(anchor)) / 7;
  const last = days.at(-1)!;
  const toToday =
    today < days[0] ? ["cal-prev"] : today > last ? ["cal-next"] : undefined;
  const title =
    view === "week"
      ? `${formatDay(campusToUtc(days[0], "12:00")!).split(", ")[1]} – ${formatDay(campusToUtc(days[6], "12:00")!).split(", ")[1]}`
      : monthFmt.format(new Date(`${monthStart}T12:00:00Z`));
  const timed = items.filter(
    (item) => !item.allDay && item.end > START && item.start < END,
  );
  const from0 = Math.max(
    START,
    Math.min(8 * 60, ...timed.map((item) => Math.floor(item.start / 60) * 60)),
  );
  const to0 = Math.min(
    END,
    Math.max(20 * 60, ...timed.map((item) => Math.ceil(item.end / 60) * 60)),
  );
  const hours = Array.from(
    { length: (to0 - from0) / 60 },
    (_, i) => from0 + i * 60,
  );

  return (
    <main id="main" className="app-page calendar-page" tabIndex={-1}>
      <PageHeader
        kicker="Calendar"
        title={
          <ViewTransition key={title} enter={TITLE} exit={TITLE} default="none">
            <span className="cal-title">{title}</span>
          </ViewTransition>
        }
        actions={
          <a className="button ghost" href="/api/v1/me/calendar.ics">
            <Icon name="download" size={18} /> <span>Export .ics</span>
          </a>
        }
      >
        <p>
          Classes from your sections, your groups’ sessions, and exam dates from
          your groups, the registrar and the Testing Center · {TZ_LABEL}
        </p>
      </PageHeader>

      <div className="cal-toolbar">
        <div className="cal-nav">
          <Link
            className="icon-button"
            href={`/calendar?view=${view}&at=${prev}`}
            scroll={false}
            aria-label={`Previous ${view}`}
            transitionTypes={["cal-prev"]}
            prefetch
          >
            <Icon name="chevronLeft" size={18} />
          </Link>
          <Link
            className="button ghost small"
            href={`/calendar?view=${view}`}
            scroll={false}
            transitionTypes={toToday}
          >
            Today
          </Link>
          <Link
            className="icon-button"
            href={`/calendar?view=${view}&at=${next}`}
            scroll={false}
            aria-label={`Next ${view}`}
            transitionTypes={["cal-next"]}
            prefetch
          >
            <Icon name="chevronRight" size={18} />
          </Link>
        </div>
        <div className="segmented" role="group" aria-label="View">
          {(["week", "month"] as const).map((v) => (
            <Link
              key={v}
              className={view === v ? "is-on" : ""}
              href={`/calendar?view=${v}&at=${anchor}`}
              scroll={false}
              aria-current={view === v ? "page" : undefined}
              transitionTypes={
                view === v
                  ? undefined
                  : [`cal-${v === "month" ? "out" : "in"}-${row}`]
              }
              prefetch
            >
              {view === v ? <SegPill name="cal-view-pill" /> : null}
              <span>{v === "week" ? "Week" : "Month"}</span>
            </Link>
          ))}
        </div>
        <p className="cal-legend" aria-hidden="true">
          <span className="kind-class">Class</span>
          <span className="kind-session">Session</span>
          <span className="kind-exam">Exam</span>
        </p>
      </div>

      <ViewTransition
        key={`${view}:${first}`}
        enter={STAGE}
        exit={STAGE}
        default="none"
      >
        <div className="cal-stage">
          {view === "week" ? (
            <>
              <div className="week-grid panel" aria-hidden="true">
                <div className="wg-head">
                  <span />
                  {days.map((d) => (
                    <span key={d} className={d === today ? "is-today" : ""}>
                      {formatDay(campusToUtc(d, "12:00")!).split(",")[0]}
                      <strong>{Number(d.slice(8))}</strong>
                    </span>
                  ))}
                </div>
                {days.some((d) => byDay.get(d)?.some((i) => i.allDay)) ? (
                  <div className="wg-allday">
                    <span>All day</span>
                    {days.map((d) => (
                      <div key={d}>
                        {(byDay.get(d) ?? [])
                          .filter((item) => item.allDay)
                          .map((item) => (
                            <Link
                              key={item.key}
                              href={item.href}
                              tabIndex={-1}
                              className={`wg-allday-event kind-${item.kind}`}
                              title={item.detail}
                            >
                              {item.title}
                            </Link>
                          ))}
                      </div>
                    ))}
                  </div>
                ) : null}
                <div
                  className="wg-body"
                  style={{ "--rows": hours.length } as React.CSSProperties}
                >
                  <div className="wg-hours">
                    {hours.map((h) => (
                      <span key={h}>{formatClock(h)}</span>
                    ))}
                  </div>
                  {days.map((d) => (
                    <div
                      key={d}
                      className={`wg-col${d === today ? " is-today" : ""}`}
                    >
                      {(byDay.get(d) ?? [])
                        .filter((item) => item.end > from0 && item.start < to0)
                        .map((item) => {
                          const top =
                            ((Math.max(item.start, from0) - from0) /
                              (to0 - from0)) *
                            100;
                          const height =
                            ((Math.min(item.end, to0) -
                              Math.max(item.start, from0)) /
                              (to0 - from0)) *
                            100;
                          return (
                            <Link
                              key={item.key}
                              href={item.href}
                              tabIndex={-1}
                              className={`wg-event kind-${item.kind}${item.cancelled ? " is-cancelled" : ""}`}
                              style={{ top: `${top}%`, height: `${height}%` }}
                              title={`${item.title} · ${item.detail}`}
                            >
                              <strong>{item.title}</strong>
                              {/* One line per part; short blocks drop whole lines. */}
                              {item.detail.split(" · ").map((part, i) => (
                                <span key={i}>{part}</span>
                              ))}
                            </Link>
                          );
                        })}
                      {d === today ? <NowLine from={from0} to={to0} /> : null}
                    </div>
                  ))}
                </div>
              </div>
              <ol className="agenda week-agenda">
                {days.map((d) => (
                  <li
                    key={d}
                    className={`agenda-day${(byDay.get(d) ?? []).length ? "" : " is-empty"}`}
                  >
                    <p className="agenda-date">
                      <strong>
                        {d === today
                          ? "Today"
                          : formatDay(campusToUtc(d, "12:00")!).split(",")[0]}
                      </strong>
                      <span>
                        {formatDay(campusToUtc(d, "12:00")!).split(", ")[1]}
                      </span>
                    </p>
                    {(byDay.get(d) ?? []).length ? (
                      <ul>
                        {byDay.get(d)!.map((item) => (
                          <li
                            key={item.key}
                            className={`agenda-item kind-${item.kind}${item.cancelled ? " is-cancelled" : ""}`}
                          >
                            <Link href={item.href}>
                              <span className="agenda-label">
                                {item.title}
                                {item.cancelled ? " (cancelled)" : ""}
                              </span>
                              <span className="agenda-detail">
                                {item.detail}
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="agenda-free">Nothing scheduled</p>
                    )}
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <SpotlightGroup className="month-wrap">
              <div className="month-grid panel" data-spotlight>
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
                  (d, i) => (
                    <span
                      key={d}
                      className={`mg-dow${i >= 5 ? " is-weekend" : ""}`}
                    >
                      {d}
                    </span>
                  ),
                )}
                {days.map((d, i) => {
                  const all = byDay.get(d) ?? [];
                  const events = all.filter((item) => item.kind !== "class");
                  const classes = all.filter((item) => item.kind === "class");
                  const flags = [
                    d.slice(0, 7) === monthStart.slice(0, 7) ? "" : "is-out",
                    d === today ? "is-today" : "",
                    d < today ? "is-past" : "",
                    i % 7 >= 5 ? "is-weekend" : "",
                    weekStart(d) === weekStart(today) ? "is-now-week" : "",
                  ].filter(Boolean);
                  return (
                    <Link
                      key={d}
                      href={`/calendar?view=week&at=${d}`}
                      scroll={false}
                      transitionTypes={[`cal-in-${Math.floor(i / 7)}`]}
                      className={["mg-day", ...flags].join(" ")}
                      data-extra={Math.max(0, all.length - 6)}
                      aria-label={`${formatDay(campusToUtc(d, "12:00")!)}: ${events.length} events, ${classes.length} classes`}
                    >
                      <span className="mg-top">
                        <span className="mg-num">{Number(d.slice(8))}</span>
                        {/* How many items didn't fit (MonthOverflow keeps
                            it right as the window resizes). */}
                        <span className="mg-more">
                          {all.length > 3 ? `+${all.length - 3}` : ""}
                        </span>
                      </span>
                      {/* Exams and sessions first, then classes by time. */}
                      {[...events, ...classes].slice(0, 6).map((item) => (
                        <span
                          key={item.key}
                          className={`mg-item kind-${item.kind}${item.cancelled ? " is-cancelled" : ""}`}
                          style={
                            item.kind === "class"
                              ? ({
                                  "--tone": tones.get(item.title),
                                } as React.CSSProperties)
                              : undefined
                          }
                        >
                          {item.allDay ? null : (
                            <time>{formatClock(item.start)}</time>
                          )}
                          <span>{item.title}</span>
                        </span>
                      ))}
                      {/* The day at a glance: when its classes, sessions
                          and exams happen between 7am and 11pm. */}
                      {all.some((item) => !item.allDay) ? (
                        <span className="mg-strip" aria-hidden="true">
                          {all
                            .filter((item) => !item.allDay && !item.cancelled)
                            .map((item) => (
                              <i
                                key={item.key}
                                className={`kind-${item.kind}`}
                                style={{
                                  left: `${((Math.max(item.start, START) - START) / (END - START)) * 100}%`,
                                  width: `${((Math.min(item.end, END) - Math.max(item.start, START)) / (END - START)) * 100}%`,
                                  ...(item.kind === "class"
                                    ? { "--tone": tones.get(item.title) }
                                    : {}),
                                }}
                              />
                            ))}
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
              <MonthOverflow />
            </SpotlightGroup>
          )}
        </div>
      </ViewTransition>
    </main>
  );
}

function shiftMonth(monthStart: string, delta: number) {
  const [y, m] = monthStart.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1 + delta, 1));
  return date.toISOString().slice(0, 10);
}

function NowLine({ from, to }: { from: number; to: number }) {
  const minute = campusMinutes(new Date());
  if (minute < from || minute > to) return null;
  return (
    <i
      className="wg-now"
      style={{ top: `${((minute - from) / (to - from)) * 100}%` }}
    />
  );
}
