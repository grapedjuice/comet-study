import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("landing provides real navigation and accurately describes preview access", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText("Student access is not open yet.")).toBeVisible();
  await page.screenshot({
    path: `output/playwright/landing-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page
    .getByRole("link", { name: "How it works", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/#how-it-works$/);
  await expect(
    page.getByRole("heading", { name: "Make it a weekly thing." }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Privacy approach", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/#privacy$/);
  await expect(
    page.getByRole("heading", { name: "Your schedule stays yours." }),
  ).toBeVisible();
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

test("landing and not-found meet automated accessibility checks @a11y", async ({
  page,
}) => {
  for (const path of ["/", "/missing-page"]) {
    await page.goto(path);
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(result.violations).toEqual([]);
  }
});
