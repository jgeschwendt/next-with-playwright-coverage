import { expect, test } from "./fixtures";

// Client behaviour that only a real click reaches: state that has to survive a
// navigation, error and not-found boundaries below the first segment, a Server
// Action, and the mobile nav.

const SLOW = 30_000;

test.describe("shared layout state", () => {
  test("/layouts keeps the layout's counter mounted across a navigation", async ({
    page,
  }) => {
    await page.goto("/layouts");

    // Lives in `layout.tsx`, above the page — the whole point of the demo.
    const counter = page.getByRole("button", { name: /Clicks$/ });
    await expect(counter).toHaveText("0 Clicks", { timeout: SLOW });

    await counter.click();
    await counter.click();
    await expect(counter).toHaveText("2 Clicks");

    await page.getByRole("link", { exact: true, name: "Clothing" }).click();
    await expect(page).toHaveURL(/\/layouts\/clothing$/);

    // A re-render would reset this to 0.
    await expect(counter).toHaveText("2 Clicks");
  });

  test("the readme collapses and expands in place", async ({ page }) => {
    await page.goto("/layouts");

    // Every demo layout mounts its readme through `<Prose collapsed>`. The
    // collapsed copy is `aria-hidden`, so the region is matched by attribute
    // rather than by role.
    const region = page.locator('[role="region"]');
    const expand = page.getByRole("button", { name: "More" });

    await expect(expand).toBeVisible({ timeout: SLOW });
    await expect(region).toHaveAttribute("aria-expanded", "false");

    await expand.click();

    const collapse = page.getByRole("button", { name: "Less" });
    await expect(collapse).toBeVisible();
    await expect(region).toHaveAttribute("aria-expanded", "true");

    await collapse.click();

    await expect(expand).toBeVisible();
    await expect(region).toHaveAttribute("aria-expanded", "false");
  });
});

test.describe("segment boundaries", () => {
  test("/error/clothing is caught by the section's error.tsx, not the demo's", async ({
    page,
  }) => {
    await page.goto("/error/clothing");

    await page.getByRole("button", { name: "Trigger Error" }).click();

    // `.first()` throughout: the dev overlay renders the same error text a
    // second time, which trips Playwright's strict mode.
    await expect(page.getByText("[section]/error.tsx").first()).toBeVisible();
    await expect(
      page.getByText("Oh no! Something went wrong.").first(),
    ).toBeVisible();

    // The tabs come from `[section]/layout.tsx`, which is *outside* the boundary
    // and so survives the error.
    await expect(
      page.getByRole("link", { exact: true, name: "Shoes" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Try Again" }).click();
    await expect(
      page.getByRole("button", { name: "Trigger Error" }),
    ).toBeVisible();
  });

  test("/not-found/clothing renders the segment's not-found.tsx for a bad category", async ({
    page,
  }) => {
    await page.goto("/not-found/clothing");

    // The layout deliberately offers a tab that resolves to no category. The
    // demo's own layout offers a same-named tab one level up, so match on href.
    await page.locator('a[href="/not-found/clothing/does-not-exist"]').click();

    await expect(page).toHaveURL(/\/not-found\/clothing\/does-not-exist$/);
    await expect(
      page.getByRole("heading", { name: "Not Found" }).first(),
    ).toBeVisible({ timeout: SLOW });
    await expect(
      page.getByText("Sorry, the requested resource could not be found"),
    ).toBeVisible();
  });
});

test.describe("server actions", () => {
  test("/private-cache changes the session cookie from a client button", async ({
    page,
  }) => {
    await page.goto("/private-cache");

    const button = page.getByRole("button", { name: "Change Session" });
    await expect(button).toBeVisible({ timeout: SLOW });
    await button.click();

    // The action sets a `session-id` cookie; the button reports the transition.
    await expect(
      page.getByRole("button", { name: "Session Changed!" }),
    ).toBeVisible({ timeout: SLOW });

    const cookies = await page.context().cookies();
    expect(cookies.map((cookie) => cookie.name)).toContain("session-id");

    // The confirmation clears itself after two seconds.
    await expect(
      page.getByRole("button", { name: "Change Session" }),
    ).toBeVisible({ timeout: SLOW });
  });
});

test.describe("mobile", () => {
  test("the global nav opens, navigates, and closes itself", async ({
    page,
  }) => {
    // The nav collapses behind a Menu button below Tailwind's `lg` breakpoint.
    await page.setViewportSize({ height: 844, width: 390 });
    await page.goto("/");

    // Open/closed is expressed purely as a class on the panel, and it has to be
    // asserted that way: the dev server this suite drives emits an empty
    // Tailwind utility layer, so nothing on the page is ever display:none.
    const panel = page.locator("nav").locator("..");
    await expect(panel).toHaveClass(/\bhidden\b/);

    await page.getByRole("button", { name: "Menu" }).click();
    await expect(panel).not.toHaveClass(/\bhidden\b/);

    // The sidebar link is `Nested Layouts` exactly; the home page's card for the
    // same demo also carries its description, so only the nav item matches.
    await page.getByRole("link", { exact: true, name: "Nested Layouts" }).click();
    await expect(page).toHaveURL(/\/layouts$/);

    // Following a nav link closes the panel behind it.
    await expect(panel).toHaveClass(/\bhidden\b/);
  });
});
