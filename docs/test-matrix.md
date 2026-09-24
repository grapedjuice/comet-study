# Endpoint and flow coverage

Status is evidence-based. The two foundation health endpoints are the first implemented family. The remaining API families in specification Section 5 are required and pending, not implicitly covered by health tests.

| Endpoint/flow | Unit/integration | Browser | Status |
|---|---|---|---|
| GET /api/v1/health/live | foundation worker tests | foundation.spec.ts | Pending execution |
| GET /api/v1/health/ready | real PostgreSQL healthy/missing migration/down | foundation.spec.ts | Pending execution |
| Landing/404/keyboard/mobile | browser | foundation.spec.ts | Pending execution |
| POST /api/v1/auth/request-verification | Unit policy + local HTTP smoke | Pending | Implemented; provider-disabled 503 and ineligible 422 verified |
| Auth verification/session/profile/preferences/availability/export/deletion | Pending | Pending | Not implemented |
| Terms/courses/sections/enrollments | Pending | Pending | Not implemented |
| Dashboard/groups/members/invitations/activity | Pending | Pending | Not implemented |
| Matches/search/shortlist | Pending | Pending | Not implemented |
| Proposals/options/votes/finalize/sessions/RSVP/attendance/calendars | Pending | Pending | Not implemented |
| Rooms/search/detail/assignment | Pending | Pending | Not implemented |
| Resources/upload/link/edit/delete/download | Pending | Pending | Not implemented |
| Exams/revisions/confirmation/resolution | Pending | Pending | Not implemented |
| Notifications/read/push | Pending | Pending | Not implemented |
| Blocks/reports/moderation | Pending | Pending | Not implemented |
| Admin sync/webhooks/jobs | Pending | Pending | Not implemented |

Automated endpoint coverage can gate implemented routes, but full-release coverage additionally requires all above families and the detailed endpoint list in the preserved specification. A passing foundation test suite is not whole-product coverage.
