"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isUuid, UserFacingError } from "@/lib/app-errors";
import { currentTerm } from "@/lib/courses";
import {
  answerRequest,
  archiveGroup,
  createGroup,
  dismissMatch,
  inviteToGroup,
  joinGroup,
  leaveGroup,
  MAX_CAPACITY,
  MIN_CAPACITY,
  removeMember,
  transferOwnership,
  updateGroup,
} from "@/lib/groups";
import { saveProfile } from "@/lib/matching";
import { DisplayName, updateName } from "@/lib/profile";
import { currentUserContext } from "@/lib/request-context";
import { addResource, deleteResource, MAX_FILE_BYTES } from "@/lib/resources";
import {
  cancelSession,
  createExam,
  createSession,
  deleteExam,
  setExamStance,
  setRsvp,
} from "@/lib/sessions";
import {
  EXAM_KINDS,
  GROUP_MODALITIES,
  ids,
  PROFILE_MODALITIES,
  RESOURCE_KINDS,
  STUDY_GOALS,
  STUDY_STYLES,
} from "@/lib/study-options";
import { campusToUtc } from "@/lib/time";

export type ActionResult =
  | { ok: true; message?: string; at: number }
  | { ok: false; error: string; at: number };

type Context = NonNullable<Awaited<ReturnType<typeof studentContext>>>;

async function studentContext() {
  const context = await currentUserContext();
  if (!context.user?.onboardingCompletedAt) return null;
  return { ...context, user: context.user, term: currentTerm() };
}

const fail = (error: string): ActionResult => ({
  ok: false,
  error,
  at: Date.now(),
});

/** Run a mutation for the signed-in student; errors become safe messages. */
async function run(
  work: (context: Context) => Promise<string | void>,
): Promise<ActionResult> {
  let context: Context | null;
  try {
    context = await studentContext();
  } catch {
    return fail(
      "Comet Study can’t reach its database right now. Try again shortly.",
    );
  }
  if (!context) return fail("Your session ended. Sign in again to continue.");
  try {
    const message = await work(context);
    refresh();
    return { ok: true, message: message ?? undefined, at: Date.now() };
  } catch (error) {
    if (error instanceof UserFacingError) return fail(error.message);
    if (error instanceof z.ZodError)
      return fail(error.issues[0]?.message ?? "Check the form and try again");
    console.error("[comet-study] action failed", error);
    return fail("Something went wrong. Try again.");
  }
}

/* ---------- Form parsing ---------- */

const text = (max: number, message = "That’s too long") =>
  z
    .string()
    .transform((value) =>
      value.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "").trim(),
    )
    .pipe(z.string().max(max, message));
const optionalText = (max: number) =>
  text(max).transform((value) => value || null);
const required = (max: number, message: string) =>
  text(max).pipe(z.string().min(1, message));
const uuid = z.string().refine(isUuid, "That link is out of date");
const httpUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((value) => {
    try {
      return ["http:", "https:"].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  }, "Links need to start with http:// or https://");

function fields(form: FormData) {
  const out: Record<string, string> = {};
  for (const [key, value] of form.entries())
    if (typeof value === "string" && !(key in out)) out[key] = value;
  return out;
}
const list = (form: FormData, key: string) =>
  form
    .getAll(key)
    .filter((value): value is string => typeof value === "string");

function when(date: string, time: string, label: string) {
  const at = campusToUtc(date, time);
  if (!at) throw new UserFacingError(`Pick a valid ${label}`);
  return at;
}

/* ---------- Profile ---------- */

const ProfileForm = z.object({
  name: DisplayName,
  modality: z.enum(ids(PROFILE_MODALITIES)),
  preferredSize: z.coerce.number().int().min(MIN_CAPACITY).max(MAX_CAPACITY),
  availability: z.string().transform((value, ctx) => {
    try {
      const parsed = JSON.parse(value || "[]");
      if (Array.isArray(parsed) && parsed.every((n) => Number.isInteger(n)))
        return parsed as number[];
    } catch {}
    ctx.addIssue({ code: "custom", message: "Couldn’t read your free times" });
    return z.NEVER;
  }),
});

export async function saveProfileAction(_: unknown, form: FormData) {
  return run(async ({ db, user }) => {
    const input = ProfileForm.parse(fields(form));
    const styles = z
      .array(z.enum(ids(STUDY_STYLES)))
      .max(6)
      .parse(list(form, "styles"));
    const goals = z
      .array(z.enum(ids(STUDY_GOALS)))
      .max(5)
      .parse(list(form, "goals"));
    await updateName(db, user.id, input.name);
    await saveProfile(db, user.id, {
      styles,
      goals,
      modality: input.modality as "in_person" | "online" | "either",
      preferredSize: input.preferredSize,
      availability: input.availability,
      discoverable: form.get("discoverable") === "on",
    });
    return "Profile saved";
  });
}

/* ---------- Groups ---------- */

const GroupForm = z.object({
  name: required(60, "Give the group a name"),
  description: optionalText(400),
  capacity: z.coerce
    .number()
    .int()
    .min(MIN_CAPACITY, "Groups hold 4–8 people")
    .max(MAX_CAPACITY, "Groups hold 4–8 people"),
  joinPolicy: z.enum(["open", "request"]),
  modality: z.enum(ids(GROUP_MODALITIES)),
  cadence: optionalText(80),
});

function groupInput(form: FormData) {
  const input = GroupForm.parse(fields(form));
  return {
    ...input,
    styles: z
      .array(z.enum(ids(STUDY_STYLES)))
      .max(6)
      .parse(list(form, "styles")),
    goals: z
      .array(z.enum(ids(STUDY_GOALS)))
      .max(5)
      .parse(list(form, "goals")),
  };
}

export async function createGroupAction(_: unknown, form: FormData) {
  let groupId: string | null = null;
  const result = await run(async ({ db, user, term }) => {
    const courseCode = z.string().min(4).max(12).parse(form.get("courseCode"));
    groupId = await createGroup(db, user.id, term, {
      ...groupInput(form),
      courseCode,
    });
  });
  if (groupId) redirect(`/groups/${groupId}?created=1`);
  return result;
}

export async function updateGroupAction(_: unknown, form: FormData) {
  return run(async ({ db, user }) => {
    await updateGroup(
      db,
      user.id,
      uuid.parse(form.get("groupId")),
      groupInput(form),
    );
    return "Group updated";
  });
}

export async function joinGroupAction(_: unknown, form: FormData) {
  return run(async ({ db, user }) => {
    const status = await joinGroup(
      db,
      user.id,
      uuid.parse(form.get("groupId")),
    );
    return status === "pending"
      ? "Request sent — the organizer will get back to you"
      : "You’re in! Welcome to the group";
  });
}

export async function leaveGroupAction(_: unknown, form: FormData) {
  const groupId = uuid.safeParse(form.get("groupId"));
  const result = await run(async ({ db, user }) => {
    if (!groupId.success) throw new UserFacingError("That link is out of date");
    await leaveGroup(db, user.id, groupId.data);
    return "Done";
  });
  if (result.ok && form.get("redirect") === "groups") redirect("/groups");
  return result;
}

export async function answerRequestAction(_: unknown, form: FormData) {
  return run(async ({ db, user }) => {
    const approve = form.get("decision") === "approve";
    await answerRequest(
      db,
      user.id,
      uuid.parse(form.get("groupId")),
      uuid.parse(form.get("userId")),
      approve,
    );
    return approve ? "Added to the group" : "Request declined";
  });
}

export async function inviteAction(_: unknown, form: FormData) {
  return run(async ({ db, user }) => {
    await inviteToGroup(
      db,
      user.id,
      uuid.parse(form.get("groupId")),
      uuid.parse(form.get("userId")),
    );
    return "Invitation sent";
  });
}

/** Start a fresh group for a course and invite one classmate to it. */
export async function startGroupWithAction(_: unknown, form: FormData) {
  let groupId: string | null = null;
  const result = await run(async ({ db, user, term }) => {
    const courseCode = z.string().min(4).max(12).parse(form.get("courseCode"));
    const invitee = uuid.parse(form.get("userId"));
    groupId = await createGroup(db, user.id, term, {
      courseCode,
      name: `${courseCode} study group`,
      description: null,
      capacity: 6,
      joinPolicy: "request",
      modality: "in_person",
      styles: [],
      goals: [],
      cadence: null,
    });
    await inviteToGroup(db, user.id, groupId, invitee);
  });
  if (groupId) redirect(`/groups/${groupId}?created=1`);
  return result;
}

export async function removeMemberAction(_: unknown, form: FormData) {
  return run(async ({ db, user }) => {
    await removeMember(
      db,
      user.id,
      uuid.parse(form.get("groupId")),
      uuid.parse(form.get("userId")),
    );
    return "Removed from the group";
  });
}

export async function transferOwnerAction(_: unknown, form: FormData) {
  return run(async ({ db, user }) => {
    await transferOwnership(
      db,
      user.id,
      uuid.parse(form.get("groupId")),
      uuid.parse(form.get("userId")),
    );
    return "Organizer role handed over";
  });
}

export async function archiveGroupAction(_: unknown, form: FormData) {
  const result = await run(async ({ db, user }) => {
    await archiveGroup(db, user.id, uuid.parse(form.get("groupId")));
  });
  if (result.ok) redirect("/groups");
  return result;
}

export async function dismissAction(_: unknown, form: FormData) {
  return run(async ({ db, user }) => {
    const type = z.enum(["group", "user"]).parse(form.get("targetType"));
    const undo = form.get("undo") === "1";
    await dismissMatch(
      db,
      user.id,
      type,
      uuid.parse(form.get("targetId")),
      undo,
    );
    return undo ? "Restored" : "Hidden from your matches";
  });
}

/* ---------- Sessions ---------- */

const SessionForm = z.object({
  groupId: uuid,
  title: required(80, "Give the session a title"),
  date: z.string(),
  start: z.string(),
  end: z.string(),
  location: optionalText(120),
  notes: optionalText(600),
});

export async function createSessionAction(_: unknown, form: FormData) {
  return run(async ({ db, user }) => {
    const input = SessionForm.parse(fields(form));
    await createSession(db, user.id, input.groupId, {
      title: input.title,
      startsAt: when(input.date, input.start, "start time"),
      endsAt: when(input.date, input.end, "end time"),
      location: input.location,
      notes: input.notes,
    });
    return "Session scheduled — members can RSVP now";
  });
}

export async function cancelSessionAction(_: unknown, form: FormData) {
  return run(async ({ db, user }) => {
    await cancelSession(db, user.id, uuid.parse(form.get("sessionId")));
    return "Session cancelled";
  });
}

export async function rsvpAction(_: unknown, form: FormData) {
  return run(async ({ db, user }) => {
    const status = z
      .enum(["going", "maybe", "not_going"])
      .parse(form.get("status"));
    await setRsvp(db, user.id, uuid.parse(form.get("sessionId")), status);
  });
}

/* ---------- Exams ---------- */

const ExamForm = z.object({
  groupId: uuid,
  kind: z.enum(ids(EXAM_KINDS)),
  label: required(60, "Name the exam, e.g. Midterm 1"),
  date: z.string(),
  start: z.string(),
  end: z.string().optional(),
  location: optionalText(80),
});

export async function createExamAction(_: unknown, form: FormData) {
  return run(async ({ db, user }) => {
    const input = ExamForm.parse(fields(form));
    await createExam(db, user.id, input.groupId, {
      kind: input.kind,
      label: input.label,
      startsAt: when(input.date, input.start, "start time"),
      endsAt: input.end ? when(input.date, input.end, "end time") : null,
      location: input.location,
    });
    return "Exam added — ask a groupmate to confirm it";
  });
}

export async function examStanceAction(_: unknown, form: FormData) {
  return run(async ({ db, user }) => {
    const stance = z
      .enum(["confirm", "dispute", "clear"])
      .parse(form.get("stance"));
    await setExamStance(
      db,
      user.id,
      uuid.parse(form.get("examId")),
      stance === "clear" ? null : stance,
    );
  });
}

export async function deleteExamAction(_: unknown, form: FormData) {
  return run(async ({ db, user }) => {
    await deleteExam(db, user.id, uuid.parse(form.get("examId")));
    return "Exam removed";
  });
}

/* ---------- Library ---------- */

const ResourceForm = z.object({
  groupId: uuid,
  kind: z.enum(ids(RESOURCE_KINDS)),
  title: required(120, "Give it a title"),
  description: optionalText(600),
  url: z.string().optional(),
});

export async function addResourceAction(_: unknown, form: FormData) {
  return run(async ({ db, user }) => {
    const input = ResourceForm.parse(fields(form));
    const upload = form.get("file");
    let file: { name: string; bytes: Buffer } | null = null;
    if (upload instanceof File && upload.size > 0) {
      if (upload.size > MAX_FILE_BYTES)
        throw new UserFacingError("Files can be up to 4 MB");
      file = {
        name: upload.name,
        bytes: Buffer.from(await upload.arrayBuffer()),
      };
    }
    const url = !file && input.url?.trim() ? httpUrl.parse(input.url) : null;
    await addResource(db, user.id, input.groupId, {
      kind: input.kind,
      title: input.title,
      description: input.description,
      url,
      file,
    });
    return "Added to the library";
  });
}

export async function deleteResourceAction(_: unknown, form: FormData) {
  return run(async ({ db, user }) => {
    await deleteResource(db, user.id, uuid.parse(form.get("resourceId")));
    return "Removed from the library";
  });
}
