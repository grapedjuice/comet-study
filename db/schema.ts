import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

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
