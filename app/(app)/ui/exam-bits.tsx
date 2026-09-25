import type { ExamBadge } from "@/lib/sessions";

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
