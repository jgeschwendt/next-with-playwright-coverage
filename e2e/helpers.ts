import type { Page } from "@playwright/test";

/**
 * Locators shared by the spec files.
 *
 * They live here rather than beside the tests because a `.spec.ts` loaded by
 * the Playwright runner under Bun must contain no TypeScript type annotations
 * at all — even `const n: number = 1` makes the whole file fail to load, and
 * the runner reports only `BuildMessage {}` / "No tests found". Imported
 * modules are transformed normally, so anything that needs types goes here.
 */

// Nothing here branches on the mode. The suite passes unchanged against both
// `next dev` and `next start`, so no assertion has been weakened for either; if
// a divergence ever appears, `process.env.COVERAGE_MODE` ("dev" | "prod") is
// set for the runner and belongs in a helper like this one, never inline in a
// spec.

/** Turbopack compiles each demo lazily; the first visit pays for the compile. */
export const SLOW = 30_000;

/**
 * The settled product grid heading. The `loading.tsx` fallbacks render a bare
 * `All`, so the count is what separates real content from a skeleton.
 */
export const PRODUCT_GRID_HEADING = /^All \(\d+\)$/;

/**
 * A page's own heading, matched by name.
 *
 * Every demo layout renders its readme above the page, and each readme opens
 * with an `<h1>` — so "the page's heading" can never be matched by position.
 */
export const heading = (page: Page, name: string | RegExp) =>
  page.getByRole("heading", { name }).first();
