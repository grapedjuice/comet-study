import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" });
const created = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updated = () =>
  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

// A deliberately narrow marker for opt-in fictional demo data.
export const demoSeedMarkers = pgTable("demo_seed_markers", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
});

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  emailNormalized: text("email_normalized").notNull().unique(),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  name: text("name"),
  accountStatus: text("account_status").notNull().default("active"),
  onboardingCompletedAt: timestamp("onboarding_completed_at", {
    withTimezone: true,
  }),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const verificationTokens = pgTable("verification_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  identifier: text("identifier").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  // Keyed hash of the requesting IP, for per-network send limits.
  requesterHash: text("requester_hash"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const sessionsAuth = pgTable("sessions_auth", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastRotatedAt: timestamp("last_rotated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// UTD course catalog cached from Nebula Labs (one row per course code, newest
// catalog year). Public academic data only.
export const catalogCourses = pgTable(
  "catalog_courses",
  {
    code: text("code").primaryKey(), // "CS 2336"
    subject: text("subject").notNull(),
    number: text("number").notNull(),
    title: text("title").notNull(),
    creditHours: text("credit_hours"),
    nebulaId: text("nebula_id").notNull(),
    catalogYear: text("catalog_year").notNull(),
    syncedAt: timestamp("synced_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("catalog_courses_subject_idx").on(table.subject)],
);

// Courses a student says they are taking in a term.
export const userCourses = pgTable(
  "user_courses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    courseCode: text("course_code")
      .notNull()
      .references(() => catalogCourses.code),
    term: text("term").notNull(), // Nebula academic session, e.g. "26F"
    sectionNumber: text("section_number"),
    sectionId: text("section_id"),
    schedule: text("schedule"), // "Mon/Wed 10:00am–11:15am · CB 1.206"
    instructor: text("instructor"),
    source: text("source").notNull().default("search"), // search | import
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("user_courses_user_course_term_idx").on(
      table.userId,
      table.courseCode,
      table.term,
    ),
    index("user_courses_course_term_idx").on(table.courseCode, table.term),
  ],
);

/* ---------- Study profile ---------- */

// How a student likes to study and when they're free. `availability` holds
// hour slots of a campus-time week: day * 24 + hour, Monday = 0.
export const studyProfiles = pgTable("study_profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  styles: text("styles")
    .array()
    .notNull()
    .default(sql`'{}'`),
  goals: text("goals")
    .array()
    .notNull()
    .default(sql`'{}'`),
  modality: text("modality").notNull().default("either"), // in_person | online | either
  preferredSize: smallint("preferred_size").notNull().default(5),
  availability: smallint("availability")
    .array()
    .notNull()
    .default(sql`'{}'`),
  discoverable: boolean("discoverable").notNull().default(true),
  updatedAt: updated(),
});

/* ---------- Groups ---------- */

export const studyGroups = pgTable(
  "study_groups",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    courseCode: text("course_code")
      .notNull()
      .references(() => catalogCourses.code),
    term: text("term").notNull(),
    sectionNumber: text("section_number"),
    name: text("name").notNull(),
    description: text("description"),
    capacity: smallint("capacity").notNull().default(6),
    joinPolicy: text("join_policy").notNull().default("open"), // open | request
    modality: text("modality").notNull().default("in_person"), // in_person | online | hybrid
    styles: text("styles")
      .array()
      .notNull()
      .default(sql`'{}'`),
    goals: text("goals")
      .array()
      .notNull()
      .default(sql`'{}'`),
    cadence: text("cadence"),
    status: text("status").notNull().default("active"), // active | archived
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: created(),
    updatedAt: updated(),
  },
  (table) => [
    index("study_groups_course_term_idx").on(table.courseCode, table.term),
    check(
      "study_groups_capacity_check",
      sql`${table.capacity} between 4 and 8`,
    ),
  ],
);

export const groupMembers = pgTable(
  "group_members",
  {
    groupId: uuid("group_id")
      .notNull()
      .references(() => studyGroups.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"), // owner | member
    status: text("status").notNull().default("active"), // active | pending | invited
    invitedBy: uuid("invited_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: created(),
    joinedAt: timestamp("joined_at", { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.groupId, table.userId] }),
    index("group_members_user_idx").on(table.userId, table.status),
  ],
);

export const groupActivity = pgTable(
  "group_activity",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => studyGroups.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => users.id, {
      onDelete: "set null",
    }),
    kind: text("kind").notNull(),
    summary: text("summary").notNull(),
    createdAt: created(),
  },
  (table) => [
    index("group_activity_group_idx").on(table.groupId, table.createdAt),
  ],
);

/* ---------- Sessions ---------- */

export const studySessions = pgTable(
  "study_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => studyGroups.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    location: text("location"),
    notes: text("notes"),
    status: text("status").notNull().default("scheduled"), // scheduled | cancelled
    sequence: integer("sequence").notNull().default(0),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: created(),
    updatedAt: updated(),
  },
  (table) => [
    index("study_sessions_group_idx").on(table.groupId, table.startsAt),
    check(
      "study_sessions_range_check",
      sql`${table.endsAt} > ${table.startsAt}`,
    ),
  ],
);

export const sessionRsvps = pgTable(
  "session_rsvps",
  {
    sessionId: uuid("session_id")
      .notNull()
      .references(() => studySessions.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status").notNull(), // going | maybe | not_going
    updatedAt: updated(),
  },
  (table) => [primaryKey({ columns: [table.sessionId, table.userId] })],
);

/* ---------- Exams ---------- */

export const groupExams = pgTable(
  "group_exams",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => studyGroups.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // midterm | final | quiz | other
    label: text("label").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    location: text("location"),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: created(),
    updatedAt: updated(),
  },
  (table) => [index("group_exams_group_idx").on(table.groupId, table.startsAt)],
);

export const examConfirmations = pgTable(
  "exam_confirmations",
  {
    examId: uuid("exam_id")
      .notNull()
      .references(() => groupExams.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    stance: text("stance").notNull(), // confirm | dispute
    createdAt: created(),
  },
  (table) => [primaryKey({ columns: [table.examId, table.userId] })],
);

/* ---------- Library ---------- */

export const resources = pgTable(
  "resources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => studyGroups.id, { onDelete: "cascade" }),
    uploaderId: uuid("uploader_id").references(() => users.id, {
      onDelete: "set null",
    }),
    kind: text("kind").notNull(), // notes | guide | problems | solutions | exam | link | other
    title: text("title").notNull(),
    description: text("description"),
    url: text("url"),
    fileName: text("file_name"),
    mime: text("mime"),
    size: integer("size"),
    checksum: text("checksum"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (table) => [
    index("resources_group_idx").on(table.groupId, table.createdAt),
    index("resources_group_checksum_idx").on(table.groupId, table.checksum),
  ],
);

// File bytes live apart from metadata so listings never pull blobs.
export const resourceFiles = pgTable("resource_files", {
  resourceId: uuid("resource_id")
    .primaryKey()
    .references(() => resources.id, { onDelete: "cascade" }),
  data: bytea("data").notNull(),
});

/* ---------- Matching ---------- */

export const matchDismissals = pgTable(
  "match_dismissals",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    targetType: text("target_type").notNull(), // group | user
    targetId: uuid("target_id").notNull(),
    createdAt: created(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.targetType, table.targetId] }),
  ],
);
