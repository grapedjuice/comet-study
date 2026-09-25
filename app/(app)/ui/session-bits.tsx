import { googleCalendarUrl } from "@/lib/calendar";
import type { RsvpStatus } from "@/lib/sessions";
import { rsvpAction } from "../actions";
import { ActionForm, SubmitButton } from "./forms";
import { Icon } from "./icons";

const OPTIONS: { value: RsvpStatus; label: string }[] = [
  { value: "going", label: "Going" },
  { value: "maybe", label: "Maybe" },
  { value: "not_going", label: "Can’t" },
];

/** Segmented RSVP; the current answer is pressed. */
export function RsvpControl({
  sessionId,
  current,
  compact = false,
}: {
  sessionId: string;
  current: RsvpStatus | null;
  compact?: boolean;
}) {
  return (
    <ActionForm
      action={rsvpAction}
      hidden={{ sessionId }}
      className={`rsvp${compact ? " compact" : ""}`}
    >
      <span className="sr-only">Your RSVP</span>
      {OPTIONS.map((option) => (
        <SubmitButton
          key={option.value}
          name="status"
          value={option.value}
          className={`rsvp-option${current === option.value ? " is-on" : ""} rsvp-${option.value}`}
        >
          {option.label}
        </SubmitButton>
      ))}
    </ActionForm>
  );
}

export function SessionCalendarLinks({
  session,
}: {
  session: {
    id: string;
    title: string;
    startsAt: Date;
    endsAt: Date;
    location: string | null;
  };
}) {
  return (
    <span className="cal-links">
      <a
        className="text-link"
        href={googleCalendarUrl(session)}
        target="_blank"
        rel="noopener noreferrer"
      >
        <Icon name="calendar" size={15} /> Google
      </a>
      <a className="text-link" href={`/api/v1/sessions/${session.id}/ics`}>
        <Icon name="download" size={15} /> .ics
      </a>
    </span>
  );
}
