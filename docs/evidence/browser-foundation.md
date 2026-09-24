# Browser foundation evidence

Tests written before UI: tests/e2e/foundation.spec.ts. Initial build on 2026-09-22 exited 1 because app/pages did not exist; no product scaffold was present. This is a scaffold dependency failure, not a passing functional RED test.

Next.js production shell build then passed (Next 16.3.6, strict TypeScript). First browser attempt collided with incomplete Chromium installation: infrastructure failures, not UI findings. After installation completed, direct desktop Playwright run: 5 passed, 1 failed, 0 skipped. Passing: in-page navigation, skip-link focus, 320px overflow, 404 recovery, axe on landing/404. Failing: health endpoint expected 200, got 404 from initial build before health routes existed. This is the functional RED health boundary. Integrated migration/readiness and mobile suite remain pending.
