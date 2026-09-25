import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { issueToken } from "../../lib/auth/policy";
import { SESSION_COOKIE } from "../../lib/auth/session";
import { createDatabaseClient } from "../../lib/db";

test("landing provides real navigation and accurately describes preview access", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(
    page.getByText("Interactive demo", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "MATH 2414", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Integral Calculus", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Thu, 3–4 pm", exact: true }).click();
  await page.getByRole("button", { name: "Try proposing this time" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Shared time Thu, 3–4 pm. Proposed in demo.",
  );
  await page.getByRole("button", { name: "PHYS 2325", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "Example session selected.",
  );
  await expect(
    page.getByRole("heading", { name: "University Physics I", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: `output/playwright/landing-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page
    .getByRole("link", { name: "How it works", exact: true })
    .filter({ visible: true })
    .first()
    .click();
  await expect(page).toHaveURL(/#how-it-works$/);
  await expect(
    page.getByRole("heading", {
      name: /Good company\.\s*A better study routine\./,
    }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Privacy approach", exact: true })
    .filter({ visible: true })
    .first()
    .click();
  await expect(page).toHaveURL(/#privacy$/);
  await expect(
    page.getByRole("heading", {
      name: /Good connections\.\s*Clear boundaries\./,
    }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Find my study group" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.getByLabel("UT Dallas email").fill("student@example.com");
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Use an eligible university email address",
  );
});

test("skip navigation supports keyboard users", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();
});

test("landing has no horizontal overflow at narrow mobile width", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");
  const width = await page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(width.content).toBeLessThanOrEqual(width.viewport);
});

test("unknown page returns 404 and offers a working home link", async ({
  page,
}) => {
  const response = await page.goto("/missing-page");
  expect(response?.status()).toBe(404);
  await page.getByRole("link", { name: "Back to Comet Study" }).click();
  await expect(page).toHaveURL("/");
});

test("health endpoints reflect running application and migrated database", async ({
  request,
}) => {
  const live = await request.get("/api/v1/health/live");
  expect(live.status()).toBe(200);
  expect(await live.json()).toMatchObject({ data: { status: "ok" } });
  const ready = await request.get("/api/v1/health/ready");
  expect(ready.status()).toBe(200);
  expect(await ready.json()).toHaveProperty("data.status");
  expect(ready.headers()["cache-control"]).toContain("no-store");
});

test("signed-out visitors are routed to sign-in and bad links explain themselves", async ({
  page,
  request,
}) => {
  const session = await request.get("/api/v1/auth/session");
  expect(await session.json()).toEqual({ data: { user: null } });
  await page.goto("/account");
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goto("/verify#token=not-a-real-token");
  await expect(
    page.getByRole("heading", { name: "That link didn’t work." }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/verify$/);
  await expect(
    page.getByRole("link", { name: /Request a new link/ }),
  ).toBeVisible();
});

test("onboarding and course APIs require a signed-in student", async ({
  page,
  request,
}) => {
  await page.goto("/welcome");
  await expect(page).toHaveURL(/\/sign-in$/);
  for (const path of [
    "/api/v1/me/courses",
    "/api/v1/courses/search?q=cs",
    "/api/v1/courses/sections?code=CS%202336",
  ])
    expect((await request.get(path)).status()).toBe(401);
  const add = await request.post("/api/v1/me/courses", {
    data: { courses: [{ code: "CS 2336" }] },
  });
  expect(add.status()).toBe(401);
  const finish = await request.post("/api/v1/me/onboarding");
  expect(finish.status()).toBe(401);
});

test("auth endpoints reject cross-site posts", async ({ request }) => {
  const response = await request.post("/api/v1/auth/request-verification", {
    headers: { origin: "https://evil.example" },
    data: { email: "student@utdallas.edu" },
  });
  expect(response.status()).toBe(403);
});

test("landing, sign-in and not-found meet automated accessibility checks @a11y", async ({
  page,
}) => {
  // Scroll-linked reveals are skipped under reduced motion, so every section
  // is audited in its final resting state.
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const path of ["/", "/sign-in", "/missing-page"]) {
    await page.goto(path);
    await page.evaluate(() => document.fonts.ready);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document
              .getAnimations()
              .filter((animation) => animation.playState === "running").length,
        ),
      )
      .toBe(0);
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(result.violations).toEqual([]);
  }
});

test("signed-in pages render per request, not from the build", async ({
  page,
  context,
  baseURL,
}) => {
  // A student who finished onboarding, signed in via a seeded session.
  const db = createDatabaseClient(process.env.DATABASE_URL!);
  const { raw, digest } = issueToken();
  const email = `e2e.${Date.now()}.${test.info().project.name}@utdallas.edu`;
  try {
    const user = await db.pool.query<{ id: string }>(
      "insert into users (email_normalized, name, email_verified_at, onboarding_completed_at) values ($1, 'Taylor Reed', now(), now()) returning id",
      [email],
    );
    await db.pool.query(
      "insert into sessions_auth (user_id, token_hash, expires_at) values ($1, $2, now() + interval '1 hour')",
      [user.rows[0].id, digest],
    );
  } finally {
    await db.close();
  }
  await context.addCookies([
    { name: SESSION_COOKIE, value: raw, url: baseURL! },
  ]);
  await page.goto("/");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Taylor");
  await page.goto("/account");
  await expect(page).toHaveURL(/\/courses$/);
  await page.goto("/profile");
  await expect(page.getByText(`Signed in as ${email}`)).toBeVisible();
  await page.goto("/welcome");
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("signed-in app pages meet automated accessibility checks @a11y", async ({
  page,
  context,
  baseURL,
}) => {
  const db = createDatabaseClient(process.env.DATABASE_URL!);
  const { raw, digest } = issueToken();
  const email = `a11y.${Date.now()}.${test.info().project.name}@utdallas.edu`;
  try {
    const user = await db.pool.query<{ id: string }>(
      "insert into users (email_normalized, name, email_verified_at, onboarding_completed_at) values ($1, 'Robin Vale', now(), now()) returning id",
      [email],
    );
    await db.pool.query(
      "insert into sessions_auth (user_id, token_hash, expires_at) values ($1, $2, now() + interval '1 hour')",
      [user.rows[0].id, digest],
    );
  } finally {
    await db.close();
  }
  await context.addCookies([
    { name: SESSION_COOKIE, value: raw, url: baseURL! },
  ]);
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const path of [
    "/dashboard",
    "/calendar",
    "/calendar?view=month",
    "/groups",
    "/groups/new",
    "/match",
    "/rooms",
    "/library",
    "/courses",
    "/profile",
  ]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(result.violations, path).toEqual([]);
  }
});

test("responses carry security headers", async ({ request }) => {
  const headers = (await request.get("/")).headers();
  expect(headers["content-security-policy"]).toContain(
    "frame-ancestors 'none'",
  );
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-powered-by"]).toBeUndefined();
});

test("the catalog cron refuses callers without the secret", async ({
  request,
}) => {
  expect((await request.get("/api/v1/cron/catalog")).status()).toBe(401);
});

test("sign-in links wait for a click so mail scanners can't spend them", async ({
  page,
}) => {
  const posts: string[] = [];
  page.on("request", (r) => r.method() === "POST" && posts.push(r.url()));
  await page.goto(`/verify#token=${"a".repeat(43)}`);
  const button = page.getByRole("button", { name: /Continue to Comet Study/ });
  await expect(button).toBeVisible();
  await expect(page).toHaveURL(/\/verify$/);
  expect(posts).toEqual([]);
  await button.click();
  await expect(
    page.getByRole("heading", { name: "That link didn’t work." }),
  ).toBeVisible();
  expect(posts.some((u) => u.endsWith("/api/v1/auth/verify-email"))).toBe(true);
});
