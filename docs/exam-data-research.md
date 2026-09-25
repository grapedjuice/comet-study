# Exam dates: research findings (2026-09-25)

Today every exam is typed in by a group member (`group_exams`, confirmed or disputed by groupmates). This note covers where exam times can come from instead. Finals and midterms need separate answers.

Network note: this sandbox's egress proxy blocks `*.utdallas.edu`, so registrar and CourseBook pages were read through search results, not fetched directly. Nebula findings come from its public source code. Verify every source below with a live request before building on it.

## Finals: official and per section

- The registrar schedules every final to a section. Per [Final Exam Assignments](https://registrar.utdallas.edu/final-exam-assignments/), finals are "generated during the second week of classes" and "can be viewed by students in Student Center, faculty in Faculty Center, and **all others in Class Search**". The page says Fall 2026 finals are viewable after September 14. Rooms "may not be the same as the regular classroom assignment and are subject to change", so students are told to recheck in Orion the week before finals.
- **Nebula does not carry per-section finals.** The CourseBook scraper ([api-tools `parser/sectionParser.go`](https://github.com/UTDNebula/api-tools/blob/develop/parser/sectionParser.go)) reads only `Class Section`, `Class/Course Number`, `Instruction Mode`, `Core`, `Schedule`, `Syllabus` and `TA/RA(s)`.
- **Nebula has the term's finals window, but no route serves it.** `AcademicCalendarSession.exams` in [`api/schema/objects.go`](https://github.com/UTDNebula/nebula-api/blob/master/api/schema/objects.go) is the finals date range per session. `swagger.yaml` on `master` has no academic-calendar route yet. The Comet Calendar also publishes finals-window events (for example ["Fall 2026 Final Exam Full Term Session"](https://calendar.utdallas.edu/event/fall-2026-final-exam-full-term-session)), which should reach us through Nebula `/calendar/{date}`.

### Options, best first

1. **Paste the Orion "Exam Schedule" (recommended first step).** Orion → Manage My Classes → Exam Schedule lists each class's final date, time and room. Reuse the "Import from Orion" paste pattern (`extractCourseCodes` in `lib/courses.ts`): parse the pasted text, match rows to the student's `user_courses`, and don't store the raw text. It's per student and accurate, and needs no new integration. It also fits the rules in `docs/data-sources.md` because the student supplies the data. One student's paste can pre-fill the exam for their whole group, so groupmates only confirm it.
2. **Ask Nebula to add finals to its scraper.** Nebula already scrapes CourseBook, and the finals are public in Class Search. A `final_exam` field on `Section` (date, start, end, location) would give us official data for every section through `/section/{id}` or `/course/{id}/sections`, which we already call (`user_courses.section_id`). This is the best long-term source. It needs an issue or PR on `UTDNebula/api-tools` and `nebula-api`, not work in this repo. Comet Study is already a Nebula-org project (see `docs/specification.md`).
3. **Scrape Class Search ourselves.** Not recommended: `docs/data-sources.md` says "No CourseBook scraping", and the spec prefers a "reviewed manual import" when automated retrieval is unstable.
4. **Show the finals window as a fallback.** Show "Finals: Dec 7–14" from Nebula `/calendar` (or the academic calendar once it has a route) for courses without a known final. It's low effort and never wrong about the window.

## Midterms and quizzes: syllabi

The spec says there is "no assumed authoritative central feed for every section's midterm", and that's still true. Most instructors do list exam dates in their syllabus, though, and syllabi are public:

- Nebula `Section.syllabus_uri` (in the schema, taken from CourseBook's "Syllabus:" row) points to a public PDF on `dox.utdallas.edu` (for example `https://dox.utdallas.edu/syl128151`). We already store the Nebula section ID for each enrolled course.
- **Proposal: "Suggested from syllabus".** When a section gets its first group member, fetch its syllabus PDF, extract the text, and pull out exam entries (kind, label, date, time if given) with an LLM using structured output. Save each result as an *unconfirmed* exam with the source set to the syllabus URL, so the existing confirm/dispute flow checks it. Cache by section and syllabus checksum. The work runs once per section per term, not once per user.
- Caveats: syllabi go stale (instructors move dates in class or on eLearning), some are missing or scanned, and dates are often relative ("Week 7"). Extracted data should never go straight to "confirmed", and the source link should always show. This adds an LLM dependency and API key that the repo doesn't have today.
- Out of bounds: Blackboard/eLearning (no approved institutional integration) and Orion scraping with student credentials.

## Recommended plan

| Step | Covers | Effort | Depends on |
| --- | --- | --- | --- |
| 1. Orion exam-schedule paste import | Finals, exact room | Small | Nothing |
| 2. Finals-window fallback from Nebula `/calendar` | Finals window | Small | Checking the live `/calendar` data |
| 3. Syllabus extraction → suggested exams | Midterms, quizzes | Medium | LLM key; `syllabus_uri` checked live |
| 4. Upstream `final_exam` on Nebula sections | Finals for everyone, automatically | Upstream PR | Nebula maintainers |

Schema impact: `group_exams` is scoped to a group. Official or imported finals belong to a **section**. Adding `section_id`, `source` (`manual | orion_import | syllabus | official`) and `source_url` to exams, as `docs/specification.md` §3.9 already sketches with `exam_dates` and official-source metadata, lets one import serve every group on that section. It also lets the UI show provenance next to the confidence badge.
