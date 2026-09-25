// Shared vocabulary for profiles, groups and matching. Safe for client code.

export const STUDY_STYLES = [
  { id: "practice", label: "Practice problems" },
  { id: "discussion", label: "Talk it through" },
  { id: "quiet", label: "Quiet co-working" },
  { id: "teach", label: "Teach each other" },
  { id: "review", label: "Review & recap" },
  { id: "visual", label: "Draw it out" },
] as const;

export const STUDY_GOALS = [
  { id: "exams", label: "Exam prep" },
  { id: "homework", label: "Homework" },
  { id: "concepts", label: "Master concepts" },
  { id: "accountability", label: "Accountability" },
  { id: "projects", label: "Projects" },
] as const;

export const GROUP_MODALITIES = [
  { id: "in_person", label: "On campus" },
  { id: "online", label: "Online" },
  { id: "hybrid", label: "Hybrid" },
] as const;

export const PROFILE_MODALITIES = [
  { id: "in_person", label: "On campus" },
  { id: "online", label: "Online" },
  { id: "either", label: "Either works" },
] as const;

export const RESOURCE_KINDS = [
  { id: "notes", label: "Notes" },
  { id: "guide", label: "Study guide" },
  { id: "problems", label: "Problem set" },
  { id: "solutions", label: "Solutions" },
  { id: "exam", label: "Practice exam" },
  { id: "link", label: "Link" },
  { id: "other", label: "Other" },
] as const;

export const EXAM_KINDS = [
  { id: "midterm", label: "Midterm" },
  { id: "final", label: "Final" },
  { id: "quiz", label: "Quiz" },
  { id: "other", label: "Other" },
] as const;

type Option = { readonly id: string; readonly label: string };
export const ids = (options: readonly Option[]) =>
  options.map((option) => option.id) as [string, ...string[]];
export const labelOf = (options: readonly Option[], id: string) =>
  options.find((option) => option.id === id)?.label ?? id;

/** Campus hours shown in availability pickers: 8am through 10pm. */
export const DAY_START_HOUR = 8;
export const DAY_END_HOUR = 22;
export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
