import type { CampusExam, StoredCampusExam } from "@/lib/campus-exams";
import type { ExamBadge } from "@/lib/sessions";
import {
  addDays,
  campusDate,
  campusToUtc,
  formatDay,
  formatTimeRange,
  relativeDay,
} from "@/lib/time";
import { Badge } from "./bits";

export function examTone(badge: ExamBadge) {
  return (
    {
      "High confidence": "good",
      Likely: "info",
      Reported: "neutral",
      Unconfirmed: "warn",
      "Conflicting reports": "danger",
    } as const
  )[badge];
}

/** Where an exam date from UTD's schedule comes from, for badges. */
export function campusExamSource(exam: Pick<CampusExam, "source">) {
  return exam.source === "registrar"
    ? ({ label: "Registrar", tone: "good" } as const)
    : exam.source === "testing-center"
      ? ({ label: "Testing Center", tone: "good" } as const)
      : ({ label: "Room booked", tone: "info" } as const);
}

type Timing = Pick<CampusExam, "allDay" | "startsAt" | "endsAt" | "openDates">;
const dayLabel = (date: string) => formatDay(campusToUtc(date, "12:00")!);

/** The campus dates a Testing Center exam can be taken: its open days, or every day of its span. */
export function campusExamDays(exam: Timing) {
  if (!exam.allDay) return [campusDate(exam.startsAt)];
  if (exam.openDates?.length) return exam.openDates;
  const days: string[] = [];
  const last = addDays(campusDate(exam.endsAt), -1);
  for (let d = campusDate(exam.startsAt); d <= last; d = addDays(d, 1))
    days.push(d);
  return days;
}

/** "Mon, Dec 14 · 9–10:45am", or "Fri, Dec 11 – Tue, Dec 15" for a span of days. */
export function campusExamWhen(exam: Timing) {
  if (!exam.allDay)
    return `${formatDay(exam.startsAt)} · ${formatTimeRange(exam.startsAt, exam.endsAt)}`;
  const first = campusDate(exam.startsAt);
  const last = addDays(campusDate(exam.endsAt), -1);
  return first === last
    ? dayLabel(first)
    : `${dayLabel(first)} – ${dayLabel(last)}`;
}

/** "in 3 days", or "open now" while a Testing Center span is running. */
export function campusExamRelative(exam: Timing, now: Date) {
  return exam.allDay && exam.startsAt <= now && exam.endsAt > now
    ? "open now"
    : relativeDay(exam.startsAt, now);
}

/** "Fri 11, Sat 12, Mon 14" */
export function openDaysLabel(dates: string[]) {
  return dates
    .map((d) => `${dayLabel(d).split(",")[0]} ${Number(d.slice(8))}`)
    .join(", ");
}

/** Exams from UTD's schedule, in the same card style as group exams. */
export function CampusExamItems({
  exams,
  now,
  showCourse = true,
}: {
  exams: StoredCampusExam[];
  now: Date;
  showCourse?: boolean;
}) {
  return (
    <ul className="exam-list">
      {exams.map((exam) => {
        const source = campusExamSource(exam);
        const [weekday, day] = formatDay(exam.startsAt).split(", ");
        return (
          <li
            key={exam.id}
            className={`exam-item${exam.endsAt < now ? " is-past" : ""}`}
          >
            <div className="exam-date-block">
              <span>{weekday}</span>
              <strong>{day}</strong>
            </div>
            <div className="exam-body">
              <p className="exam-title">
                {showCourse
                  ? `${exam.courseCode}${exam.sectionNumber ? `.${exam.sectionNumber}` : ""} `
                  : ""}
                {exam.label} <Badge tone={source.tone}>{source.label}</Badge>
              </p>
              <p className="exam-meta">
                {exam.allDay
                  ? campusExamWhen(exam)
                  : formatTimeRange(exam.startsAt, exam.endsAt)}
                {exam.location ? ` · ${exam.location}` : ""} ·{" "}
                {campusExamRelative(exam, now)}
              </p>
              {exam.allDay ? (
                <p className="exam-confidence">
                  {exam.openDates?.length
                    ? `Open ${openDaysLabel(exam.openDates)} · `
                    : "Pick a day and time · "}
                  {exam.bookingUrl ? (
                    <a
                      className="text-link"
                      href={exam.bookingUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Book on RegisterBlast
                    </a>
                  ) : (
                    "book on RegisterBlast"
                  )}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
