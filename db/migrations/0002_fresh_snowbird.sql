CREATE TABLE "catalog_courses" (
	"code" text PRIMARY KEY NOT NULL,
	"subject" text NOT NULL,
	"number" text NOT NULL,
	"title" text NOT NULL,
	"credit_hours" text,
	"nebula_id" text NOT NULL,
	"catalog_year" text NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"course_code" text NOT NULL,
	"term" text NOT NULL,
	"section_number" text,
	"section_id" text,
	"schedule" text,
	"instructor" text,
	"source" text DEFAULT 'search' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_courses" ADD CONSTRAINT "user_courses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_courses" ADD CONSTRAINT "user_courses_course_code_catalog_courses_code_fk" FOREIGN KEY ("course_code") REFERENCES "public"."catalog_courses"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "catalog_courses_subject_idx" ON "catalog_courses" USING btree ("subject");--> statement-breakpoint
CREATE UNIQUE INDEX "user_courses_user_course_term_idx" ON "user_courses" USING btree ("user_id","course_code","term");--> statement-breakpoint
CREATE INDEX "user_courses_course_term_idx" ON "user_courses" USING btree ("course_code","term");