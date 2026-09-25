CREATE TABLE "exam_confirmations" (
	"exam_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"stance" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exam_confirmations_exam_id_user_id_pk" PRIMARY KEY("exam_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "group_activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"actor_id" uuid,
	"kind" text NOT NULL,
	"summary" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_exams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"location" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_members" (
	"group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"invited_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"joined_at" timestamp with time zone,
	CONSTRAINT "group_members_group_id_user_id_pk" PRIMARY KEY("group_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "match_dismissals" (
	"user_id" uuid NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_dismissals_user_id_target_type_target_id_pk" PRIMARY KEY("user_id","target_type","target_id")
);
--> statement-breakpoint
CREATE TABLE "resource_files" (
	"resource_id" uuid PRIMARY KEY NOT NULL,
	"data" "bytea" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"uploader_id" uuid,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"url" text,
	"file_name" text,
	"mime" text,
	"size" integer,
	"checksum" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_rsvps" (
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_rsvps_session_id_user_id_pk" PRIMARY KEY("session_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "study_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_code" text NOT NULL,
	"term" text NOT NULL,
	"section_number" text,
	"name" text NOT NULL,
	"description" text,
	"capacity" smallint DEFAULT 6 NOT NULL,
	"join_policy" text DEFAULT 'open' NOT NULL,
	"modality" text DEFAULT 'in_person' NOT NULL,
	"styles" text[] DEFAULT '{}' NOT NULL,
	"goals" text[] DEFAULT '{}' NOT NULL,
	"cadence" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "study_groups_capacity_check" CHECK ("study_groups"."capacity" between 4 and 8)
);
--> statement-breakpoint
CREATE TABLE "study_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"styles" text[] DEFAULT '{}' NOT NULL,
	"goals" text[] DEFAULT '{}' NOT NULL,
	"modality" text DEFAULT 'either' NOT NULL,
	"preferred_size" smallint DEFAULT 5 NOT NULL,
	"availability" smallint[] DEFAULT '{}' NOT NULL,
	"discoverable" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"title" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"location" text,
	"notes" text,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"sequence" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "study_sessions_range_check" CHECK ("study_sessions"."ends_at" > "study_sessions"."starts_at")
);
--> statement-breakpoint
ALTER TABLE "exam_confirmations" ADD CONSTRAINT "exam_confirmations_exam_id_group_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."group_exams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_confirmations" ADD CONSTRAINT "exam_confirmations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_activity" ADD CONSTRAINT "group_activity_group_id_study_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."study_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_activity" ADD CONSTRAINT "group_activity_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_exams" ADD CONSTRAINT "group_exams_group_id_study_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."study_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_exams" ADD CONSTRAINT "group_exams_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_study_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."study_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_dismissals" ADD CONSTRAINT "match_dismissals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_files" ADD CONSTRAINT "resource_files_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_group_id_study_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."study_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_uploader_id_users_id_fk" FOREIGN KEY ("uploader_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_rsvps" ADD CONSTRAINT "session_rsvps_session_id_study_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."study_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_rsvps" ADD CONSTRAINT "session_rsvps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_groups" ADD CONSTRAINT "study_groups_course_code_catalog_courses_code_fk" FOREIGN KEY ("course_code") REFERENCES "public"."catalog_courses"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_groups" ADD CONSTRAINT "study_groups_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_profiles" ADD CONSTRAINT "study_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_group_id_study_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."study_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "group_activity_group_idx" ON "group_activity" USING btree ("group_id","created_at");--> statement-breakpoint
CREATE INDEX "group_exams_group_idx" ON "group_exams" USING btree ("group_id","starts_at");--> statement-breakpoint
CREATE INDEX "group_members_user_idx" ON "group_members" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "resources_group_idx" ON "resources" USING btree ("group_id","created_at");--> statement-breakpoint
CREATE INDEX "resources_group_checksum_idx" ON "resources" USING btree ("group_id","checksum");--> statement-breakpoint
CREATE INDEX "study_groups_course_term_idx" ON "study_groups" USING btree ("course_code","term");--> statement-breakpoint
CREATE INDEX "study_sessions_group_idx" ON "study_sessions" USING btree ("group_id","starts_at");