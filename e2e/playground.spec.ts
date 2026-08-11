import { data } from "../app/_internal/_data";
import { expect, test } from "./fixtures";

// The demo list is read straight out of the app's own mock database, so a demo
// added upstream gets a smoke test for free. `_data.ts` is plain data with no
// imports at all (`lib/db.ts` is the module that pulls in `server-only`), so it
// is safe to load inside the Playwright runner.
const demos = data.demos.flatMap((section) =>
  section.items.map((item) => ({ section: section.name, ...item })),
);

test.describe("home", () => {
  test("lists every demo", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: "Playground" }),
    ).toBeVisible();

    for (const demo of demos) {
      await expect(
        page.getByRole("link", { name: demo.name, exact: false }).first(),
      ).toBeVisible();
    }
  });
});

test.describe("demo routes", () => {
  for (const demo of demos) {
    test(`${demo.section} › /${demo.slug} renders`, async ({ page }) => {
      const response = await page.goto(`/${demo.slug}`);

      expect(response?.status(), `/${demo.slug} status`).toBe(200);

      // Streaming + a lazily-compiling dev server makes `networkidle` useless
      // here; wait on the content the route is supposed to paint instead.
      const heading = page.locator("h1").first();
      await expect(heading).toBeVisible({ timeout: 30_000 });
      await expect(heading).not.toBeEmpty();

      // Next's dev error page hijacks the document title; a rendered demo never
      // does. This catches a route that 200s while erroring in the boundary.
      await expect(page).not.toHaveTitle(/^Application error/);
      await expect(
        page.getByText("Unhandled Runtime Error"),
      ).toHaveCount(0);
    });
  }
});

test.describe("interactivity", () => {
  // Proves client JS actually hydrates — the canary for the Next 16 dev-server
  // 403 that silently starves the page of its chunks when the Host header is
  // not an allowed dev origin.
  test("/context propagates state through a client context provider", async ({
    page,
  }) => {
    await page.goto("/context");

    const counter = page.getByRole("button", { name: /Clicks$/ }).first();
    await expect(counter).toHaveText("0 Clicks");

    await counter.click();
    await expect(counter).toHaveText("1 Clicks");

    await counter.click();
    await counter.click();
    await expect(counter).toHaveText("3 Clicks");
  });

  test("/error renders the error boundary when the buggy button throws", async ({
    page,
  }) => {
    await page.goto("/error");

    await expect(
      page.getByRole("heading", { name: "All", exact: false }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Trigger Error" }).click();

    // `.first()` throughout: the dev overlay renders the same error text a
    // second time, which trips Playwright's strict mode.
    await expect(
      page.getByRole("heading", { name: "Error", exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByText("Oh no! Something went wrong.").first(),
    ).toBeVisible();

    await page.getByRole("button", { name: "Try Again" }).click();
    await expect(
      page.getByRole("button", { name: "Trigger Error" }),
    ).toBeVisible();
  });
});
