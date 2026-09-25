# Data sources

Nebula is the canonical campus adapter. Official repository: https://github.com/UTDNebula/nebula-api . Product overview: https://www.utdnebula.com/projects/api . Authentication uses a server-side x-api-key header. Expected course/section/professor/grades/rooms/events/calendar endpoints require contract inspection before implementation. Live responses have NOT been verified. No CourseBook scraping.

Registrar finals: https://registrar.utdallas.edu/final-exam-assignments/ ; import only verifiable official data with provenance and freshness. No Blackboard scraping. Library LibCal and UTD SSO require sanctioned institutional access. Their availability is unknown. See [exam-data-research.md](exam-data-research.md) for exam-time sources.

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
