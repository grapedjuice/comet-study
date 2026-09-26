# Data sources

Nebula is the canonical campus adapter. Official repository: https://github.com/UTDNebula/nebula-api . Product overview: https://www.utdnebula.com/projects/api . Authentication uses a server-side x-api-key header. Expected course/section/professor/grades/rooms/events/calendar endpoints require contract inspection before implementation. Live responses have NOT been verified. No CourseBook scraping.

Registrar finals: https://registrar.utdallas.edu/final-exam-assignments/ ; import only verifiable official data with provenance and freshness (see "Exam dates" below). No Blackboard scraping. Library LibCal and UTD SSO require sanctioned institutional access. Their availability is unknown.

Fixture identities and academic records must be explicitly fictional. Fixture data must carry a visible non-production label. Upstream outage must not silently become synthetic production results.


## Student enrollment: research findings (2026-09-24)

There is no student-consentable way to read a UTD student's enrolled courses:

- **UTD SSO** is Shibboleth/SAML (`idp.utdallas.edu`). Per OIT's Atlas article [Request Single Sign-On for Application or Service](https://atlas.utdallas.edu/TDClient/30/Portal/KB/Article/217/Request-Single-Sign-On-for-Application-or-Service): "A staff or faculty member must submit this request; requests from students or student employees will be denied." Released attributes are identity (display name, email, NetID), not enrollments.
- **Orion / Schedule Planner** expose no student API, and the registrar's [Schedule Planner guide](https://registrar.utdallas.edu/registration/schedule-planner/schedule-planner-guide-for-students/) documents no ICS or schedule export.
- **Nebula Labs API** is public catalog data (courses, sections, professors), not per-student records.

What Comet Study does instead (implemented):

1. Onboarding (`/welcome`) collects a display name, then courses.
2. Courses come from the Nebula catalog, cached in `catalog_courses` (`npm run catalog:sync`, or automatically on first search, refreshed weekly). Section times and instructors for the current term are fetched live from Nebula when a student picks a course.
3. **Import from Orion**: the student pastes their schedule page text; `extractCourseCodes` finds course codes and sections (including Orion's "Class Nbr → Section" column and variable-credit codes like `CS 4V98`), each verified against the catalog and live sections. Pasted text is never stored.

Live Nebula contract checks (2026-09-24, with `DATA_MODE=live`): `/course/all` returns ~20.8k rows (4,089 distinct codes across catalog years). Current-term sections live under the **newest catalog year's** course id via `/course/{id}/sections`; `/course/sections?…` returns only one page of mixed terms. Only exact-match filters exist, hence the local catalog cache for search.

A real Orion sync needs a faculty/staff sponsor and a registrar data agreement.


## Exam dates: research findings (2026-09-25)

Implemented in `lib/campus-exams.ts`, stored in `exam_windows` and `campus_exams`, refreshed daily by `/api/v1/cron/exams` (or `npm run exams:sync`). Section-specific exams only show for a course once the student has set their section; the Courses page says which sections have exams listed.

- **Registrar page** ([Final Exam Assignments](https://registrar.utdallas.edu/final-exam-assignments/)) publishes only each term's final-exam *periods* ("Full term and second 8-week classes: December 11 – 16", "First 8-week classes: October 13 – 17"). It says per-section assignments are in Orion Student Center and, for everyone else, in Class Search (CourseBook). The academic calendar lists the same periods.
- **CourseBook** shows each section's official final under "Exams:" (from Sept 14 for Fall 2026), but search sits behind reCAPTCHA, so we don't scrape it. We used it only to check our data by hand.
- **Ad Astra room schedule** (Nebula `/astra/{date}`) is where the registrar books each final. During an exam period a section's reservation ("CS 3345/001 - DATA STRUCT …") is its final slot. It matched CourseBook for every section we checked: CS 3345.001 (Dec 14 9:00–10:45 ECSS 2.203), PHYS 2325.001 (Dec 15 11:00–12:45 SCI 1.210), SYSM 6320.501 (Dec 14 7:00–9:45pm, its usual class time), BA 3105.054 (first 8-week, Oct 15 1:00–3:45pm SOM 2.112). Sections CourseBook lists with no final (CS 1337.001, MATH 2418.001) have no reservation. BUAN 6390.S01 has no final but still meets Fridays through Dec 16, so an in-window booking is not always a final.
  - Rules: in the term's last exam period, a booking is a final unless it repeats the section's weekly slot. Earlier periods (8-week sessions) overlap other classes, so a section must stop meeting after the period. Any uncertain booking is confirmed against Nebula section meeting end dates (final only after the last class day) and dropped if unconfirmed.
  - Nebula serves roughly today onward, not past days. Each sync replaces only the days it read, so past exams stay stored.
- **Testing Center (RegisterBlast)**, added 2026-09-25 after a student noticed CE/EE 3161's final was missing. The [UTD Testing Center exam list](https://www.registerblast.com/utdallas/Exam/List) is public (sign-in is only needed to book). Instructors post exams students take there on a span of days, booking their own time. Fall 2026 had about 1,070 listings across ECS, NSM, JSOM, AHT, BBS and EPPS: finals, midterms and quizzes, none of which appear in Ad Astra.
  - The page's own read-only JSON calls: `/Exam/GroupChosen/{school}/1` lists a school's exams, and `/Exam/GetDateStepDates/{exam}` returns the days that still have open times (CE/EE 3161.091's final: Dec 11, 12, 14, 15; the center is closed Sunday). No session is needed.
  - Titles are read like "CE/EE 3161.091/092 Soc Issues & Ethics in Engr (M&W Classes) - Final (12/11-12/15) - R. Mezenner" (course codes × sections, label, span; the year is the nearest one). Approval-only sittings (ARC accommodations, make-ups, "Early", "Require Professor Approval") are skipped because they aren't the class's dates. Hand-typed variants like `ITSS.3300`, `4v90` and `(12/7/12/9)` are accepted.
  - Stored as whole-day spans (`all_day`) with `booking_url`. Open days are looked up only for courses someone has added (at most 120 per sync) and shown as "Open Fri 11, Sat 12, …". Each sync replaces upcoming Testing Center exams only if every school's list loaded.
- **Midterms and common exams** beyond the Testing Center have no central source. Departments do book rooms on the same schedule under names like "2268 MATH 1325 Common Exam", "CS 5330.001 Exam 1", "CS3377 Test 1". We keep bookings that pair a catalog course code with an exam word, skip "review"/setup/teardown holds, merge multi-room bookings, and label them "Room booked" (a department reservation, not a confirmed date). Fall 2026 had 26 of these.
- **Syllabi** (Nebula `syllabus_uri` → dox.utdallas.edu PDFs) do contain exam dates, but they sit in tables that don't extract cleanly (0 of 3 samples gave a usable date), so they aren't used.
- Group members can still add and confirm their own exam dates alongside all of these.

