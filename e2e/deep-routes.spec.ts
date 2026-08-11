import { expect, test } from "./fixtures";
import { PRODUCT_GRID_HEADING, SLOW, heading } from "./helpers";

// `playground.spec.ts` only ever lands on `/<demo>`. Every demo, though, is a
// tree: `[section]`/`[category]` segments, parallel-route slots, product detail
// pages. Those deeper segments are where `lib/db.ts` is actually queried with a
// `where` clause, and where the layout/loading/not-found conventions below the
// first segment live.

test.describe("section and category segments", () => {
  // These five demos share one shape: `[section]/layout.tsx` builds tabs from
  // `db.category.findMany({ where: { section } })`, and the pages below it
  // filter products by section and then by category.
  for (const demo of [
    "error",
    "layouts",
    "loading",
    "not-found",
    "use-link-status",
  ]) {
    test(`/${demo} drills from a section into a category`, async ({ page }) => {
      const response = await page.goto(`/${demo}/clothing`);
      expect(response?.status(), `/${demo}/clothing status`).toBe(200);

      await expect(heading(page, PRODUCT_GRID_HEADING)).toBeVisible({
        timeout: SLOW,
      });

      // The tab strip is the visible proof that the section resolved and its
      // categories were looked up.
      for (const tab of ["All", "Tops", "Shorts", "Shoes"]) {
        await expect(
          page.getByRole("link", { exact: true, name: tab }),
        ).toBeVisible();
      }

      await page.getByRole("link", { exact: true, name: "Tops" }).click();

      await expect(page).toHaveURL(new RegExp(`/${demo}/clothing/tops$`));
      await expect(heading(page, PRODUCT_GRID_HEADING)).toBeVisible({
        timeout: SLOW,
      });
    });
  }
});

test.describe("route groups", () => {
  test("/route-groups nests three groups under one URL space", async ({
    page,
  }) => {
    await page.goto("/route-groups");
    await expect(heading(page, PRODUCT_GRID_HEADING)).toBeVisible({
      timeout: SLOW,
    });

    // (main)/(shop): the section tabs come from a different group's layout than
    // the Home/Checkout/Blog tabs above them, yet share the `/route-groups` path.
    await page.getByRole("link", { exact: true, name: "Clothing" }).click();
    await expect(page).toHaveURL(/\/route-groups\/clothing$/);

    const shorts = page.getByRole("link", { exact: true, name: "Shorts" });
    await expect(shorts).toBeVisible({ timeout: SLOW });
    await shorts.click();
    await expect(page).toHaveURL(/\/route-groups\/clothing\/shorts$/);
    await expect(heading(page, PRODUCT_GRID_HEADING)).toBeVisible({
      timeout: SLOW,
    });

    // (main)/(marketing) and (checkout) are siblings of (shop) that opt out of
    // the shop layout entirely.
    await page.goto("/route-groups/blog");
    await expect(heading(page, "Blog")).toBeVisible({ timeout: SLOW });

    await page.goto("/route-groups/checkout");
    await expect(heading(page, "Checkout")).toBeVisible({ timeout: SLOW });
    await expect(
      page.getByRole("link", { exact: true, name: "Back" }),
    ).toBeVisible();
  });
});

test.describe("parallel routes", () => {
  test("/parallel-routes renders both slots and swaps one at a time", async ({
    page,
  }) => {
    await page.goto("/parallel-routes");

    await expect(heading(page, "Channel analytics")).toBeVisible({
      timeout: SLOW,
    });
    await expect(heading(page, "Audience stats")).toBeVisible();
    await expect(heading(page, "View stats")).toBeVisible();

    // Soft navigation: only the @audience slot re-renders, @views holds its
    // current subpage.
    await page.getByRole("link", { exact: true, name: "Subscribers" }).click();
    await expect(page).toHaveURL(/\/parallel-routes\/subscribers$/);
    await expect(heading(page, "Audience subscriber stats")).toBeVisible({
      timeout: SLOW,
    });
    await expect(heading(page, "View stats")).toBeVisible();

    await page.getByRole("link", { exact: true, name: "Impressions" }).click();
    await expect(heading(page, "View impression stats")).toBeVisible({
      timeout: SLOW,
    });
  });

  test("/parallel-routes falls back to default.tsx on a hard load", async ({
    page,
  }) => {
    // A full page load of a slot-specific URL leaves the other slots without a
    // match, so each of them renders its `default.tsx` instead.
    await page.goto("/parallel-routes/demographics");
    await expect(heading(page, "Audience demographics stats")).toBeVisible({
      timeout: SLOW,
    });
    await expect(heading(page, "Default")).toBeVisible();

    await page.goto("/parallel-routes/view-duration");
    await expect(heading(page, "View duration stats")).toBeVisible({
      timeout: SLOW,
    });
    await expect(heading(page, "Default")).toBeVisible();
  });
});

test.describe("private cache", () => {
  test("/private-cache opens both the private and the dynamic product page", async ({
    page,
  }) => {
    await page.goto("/private-cache");

    await expect(heading(page, /^Available Products/)).toBeVisible({
      timeout: SLOW,
    });

    // The first half of the grid is wrapped in prefetchable private-cache links,
    // which label their own boundary with the live prefetch state; the second
    // half is not prefetchable at all.
    await expect(
      page.getByText(/<Link> \((Prefetching|Prefetched) Private Cache/).first(),
    ).toBeVisible({ timeout: SLOW });
    await expect(
      page.getByText("<Link> (No Private Cache)").first(),
    ).toBeVisible();

    // `use cache: private` recommendations — reachable only from the detail
    // page. `.first()`: the Suspense fallback carries the same boundary label as
    // the content that replaces it, so both are briefly in the DOM.
    await page.goto("/private-cache/product/1/with-private");
    await expect(heading(page, "Recommendations")).toBeVisible({
      timeout: SLOW,
    });
    await expect(
      page
        .getByText("<Recommendations> (Private Cacheable + Runtime Prefetch)")
        .first(),
    ).toBeVisible();

    // The same page without `use cache: private`: same data, purely dynamic.
    await page.goto("/private-cache/product/4/without-private");
    await expect(heading(page, "Recommendations")).toBeVisible({
      timeout: SLOW,
    });
    await expect(
      page.getByText("<Recommendations> (Dynamic)").first(),
    ).toBeVisible();

    await page.getByRole("link", { name: "Shop" }).click();
    await expect(page).toHaveURL(/\/private-cache$/);
  });
});

test.describe("app shell upgrading", () => {
  test("/app-shell-upgrading opens a prerendered and a runtime-discovered product", async ({
    page,
  }) => {
    await page.goto("/app-shell-upgrading");

    // Products 1–3 come from `generateStaticParams`; the rest get a
    // session-scoped slug minted in the browser, so their links only settle once
    // the client effect has run.
    await expect(page.getByText(/Session suffix:/)).toBeVisible({
      timeout: SLOW,
    });

    await page
      .getByRole("link", { name: /build time$/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/app-shell-upgrading\/1$/);
    await expect(heading(page, "Top")).toBeVisible({ timeout: SLOW });
    await expect(page.getByText("$29.99")).toBeVisible();

    await page.getByRole("link", { name: /Back to products/ }).click();
    await expect(page.getByText(/Session suffix:/)).toBeVisible({
      timeout: SLOW,
    });

    await page
      .getByRole("link", { name: /request time$/ })
      .first()
      .click();
    // `<id>-<session suffix>`: never prerendered, so this is the app-shell path.
    await expect(page).toHaveURL(/\/app-shell-upgrading\/4-[a-z0-9]+$/);
    await expect(heading(page, "Phone")).toBeVisible({ timeout: SLOW });
  });
});

test.describe("view transitions", () => {
  test("/view-transitions pages through the product detail route", async ({
    page,
  }) => {
    await page.goto("/view-transitions");
    await expect(heading(page, "Shop")).toBeVisible({ timeout: SLOW });

    await page.getByRole("link", { exact: true, name: "Top" }).click();
    await expect(page).toHaveURL(/\/view-transitions\/posts\/1$/);

    // Prev/next wrap around the product list, which is what `db.product.find`
    // computes alongside the product itself.
    const next = page.getByRole("link", { name: "Next" });
    await expect(next).toBeVisible({ timeout: SLOW });
    await next.click();
    await expect(page).toHaveURL(/\/view-transitions\/posts\/2$/);

    await page.getByRole("link", { name: "Previous" }).click();
    await expect(page).toHaveURL(/\/view-transitions\/posts\/1$/);

    await page.getByRole("link", { name: "Shop" }).click();
    await expect(page).toHaveURL(/\/view-transitions$/);
    await expect(heading(page, "Shop")).toBeVisible({ timeout: SLOW });
  });
});

test.describe("missing segments", () => {
  // Each `[section]` layout and each `[category]` page re-validates its own
  // param against the mock ORM and calls `notFound()`, so a bad URL is the only
  // way those guards ever run. The status code is not asserted: several of these
  // demos stream a shell first, which commits a 200 before the guard trips.
  for (const demo of [
    "error",
    "layouts",
    "loading",
    "not-found",
    "route-groups",
    "use-link-status",
  ]) {
    test(`/${demo} shows Not Found for an unknown section and category`, async ({
      page,
    }) => {
      await page.goto(`/${demo}/no-such-section`);
      await expect(heading(page, "Not Found")).toBeVisible({ timeout: SLOW });
      await expect(heading(page, PRODUCT_GRID_HEADING)).toHaveCount(0);

      await page.goto(`/${demo}/clothing/no-such-category`);
      await expect(heading(page, "Not Found")).toBeVisible({ timeout: SLOW });
      await expect(heading(page, PRODUCT_GRID_HEADING)).toHaveCount(0);
    });
  }

  test("the product detail routes show Not Found for an unknown id", async ({
    page,
  }) => {
    for (const url of [
      "/app-shell-upgrading/999",
      "/private-cache/product/999/with-private",
      "/private-cache/product/999/without-private",
      "/view-transitions/posts/999",
    ]) {
      await page.goto(url);
      await expect(heading(page, "Not Found"), url).toBeVisible({
        timeout: SLOW,
      });
    }
  });
});
