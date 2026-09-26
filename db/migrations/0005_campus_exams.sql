CREATE TABLE "campus_exams" (
	"id" text PRIMARY KEY NOT NULL,
	"term" text NOT NULL,
	"course_code" text NOT NULL,
	"section_number" text,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"location" text,
	"all_day" boolean DEFAULT false NOT NULL,
	"open_dates" text[],
	"booking_url" text,
	"source" text NOT NULL,
	"source_name" text NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exam_windows" (
	"term" text NOT NULL,
	"label" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"source_url" text NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exam_windows_term_label_pk" PRIMARY KEY("term","label")
);
--> statement-breakpoint
CREATE INDEX "campus_exams_course_term_idx" ON "campus_exams" USING btree ("course_code","term");--> statement-breakpoint
CREATE INDEX "campus_exams_starts_idx" ON "campus_exams" USING btree ("starts_at");