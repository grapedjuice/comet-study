import type { Metadata } from "next";
import Link from "next/link";
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
import { PageHeader } from "../ui/bits";
import {
  campusExamDays,
  campusExamSource,
  campusExamWhen,
} from "../ui/exam-bits";
import { Icon } from "../ui/icons";

export const metadata: Metadata = { title: "Calendar — Comet Study" };

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
  const title =
    view === "week"
      ? `${formatDay(campusToUtc(days[0], "12:00")!).split(", ")[1]} – ${formatDay(campusToUtc(days[6], "12:00")!).split(", ")[1]}`
      : monthFmt.format(new Date(`${monthStart}T12:00:00Z`));
  const hours = Array.from(
    { length: (END - START) / 60 },
    (_, i) => START + i * 60,
  );

  return (
    <main id="main" className="app-page calendar-page" tabIndex={-1}>
      <PageHeader
        kicker="Calendar"
        title={title}
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
            aria-label={`Previous ${view}`}
          >
            <Icon name="chevronLeft" size={18} />
          </Link>
          <Link className="button ghost small" href={`/calendar?view=${view}`}>
            Today
          </Link>
          <Link
            className="icon-button"
            href={`/calendar?view=${view}&at=${next}`}
            aria-label={`Next ${view}`}
          >
            <Icon name="chevronRight" size={18} />
          </Link>
        </div>
        <div className="segmented" role="group" aria-label="View">
          <Link
            className={view === "week" ? "is-on" : ""}
            href={`/calendar?view=week&at=${anchor}`}
            aria-current={view === "week" ? "page" : undefined}
          >
            Week
          </Link>
          <Link
            className={view === "month" ? "is-on" : ""}
            href={`/calendar?view=month&at=${anchor}`}
            aria-current={view === "month" ? "page" : undefined}
          >
            Month
          </Link>
        </div>
        <p className="cal-legend" aria-hidden="true">
          <span className="kind-class">Class</span>
          <span className="kind-session">Session</span>
          <span className="kind-exam">Exam</span>
        </p>
      </div>

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
                    .filter((item) => item.end > START && item.start < END)
                    .map((item) => {
                      const top =
                        ((Math.max(item.start, START) - START) /
                          (END - START)) *
                        100;
                      const height =
                        ((Math.min(item.end, END) -
                          Math.max(item.start, START)) /
                          (END - START)) *
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
                  {d === today ? <NowLine /> : null}
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
                          <span className="agenda-detail">{item.detail}</span>
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
        <div className="month-grid panel">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <span key={d} className="mg-dow">
              {d}
            </span>
          ))}
          {days.map((d) => {
            const dayItems = (byDay.get(d) ?? []).filter(
              (i) => i.kind !== "class",
            );
            const classes = (byDay.get(d) ?? []).filter(
              (i) => i.kind === "class",
            ).length;
            return (
              <Link
                key={d}
                href={`/calendar?view=week&at=${d}`}
                className={`mg-day${d.slice(0, 7) === monthStart.slice(0, 7) ? "" : " is-out"}${d === today ? " is-today" : ""}`}
                aria-label={`${formatDay(campusToUtc(d, "12:00")!)}: ${dayItems.length} events, ${classes} classes`}
              >
                <span className="mg-num">{Number(d.slice(8))}</span>
                {dayItems.slice(0, 3).map((item) => (
                  <span
                    key={item.key}
                    className={`mg-event kind-${item.kind}${item.cancelled ? " is-cancelled" : ""}`}
                  >
                    {item.title}
                  </span>
                ))}
                {dayItems.length > 3 ? (
                  <span className="mg-more">+{dayItems.length - 3} more</span>
                ) : null}
                {classes ? (
                  <span className="mg-classes">
                    {classes} {classes === 1 ? "class" : "classes"}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}

function shiftMonth(monthStart: string, delta: number) {
  const [y, m] = monthStart.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1 + delta, 1));
  return date.toISOString().slice(0, 10);
}

function NowLine() {
  const minute = campusMinutes(new Date());
  if (minute < START || minute > END) return null;
  return (
    <i
      className="wg-now"
      style={{ top: `${((minute - START) / (END - START)) * 100}%` }}
    />
  );
}
