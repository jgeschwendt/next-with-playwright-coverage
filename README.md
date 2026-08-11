# next-play

Vercel's [app-playground](https://github.com/vercel/app-playground) template on
Next.js 16 App Router, wired to Playwright e2e tests and Istanbul-format code
coverage that spans both Client and Server Components.
Bun is the only toolchain — every command below runs through `bun`/`bunx`.

## Commands

```bash
bun run build            # plain production build — no instrumentation at all
bun run coverage         # coverage against a production build (build + start)
bun run coverage:build   # just the instrumented `next build` half of the above
bun run coverage:dev     # the same suite against the Turbopack dev server
bun run coverage:report  # re-render reports from existing .nyc_output
bun run dev              # dev server (Turbopack) on :3000
bun run test:e2e         # Playwright e2e tests (chromium) — see COVERAGE_MODE
bun run typecheck        # tsc --noEmit
```

Instrumentation is opt-in on `COVERAGE=1`, which the two coverage scripts set
and nothing else does. It controls both halves at once: `experimental.swcPlugins`
in `next.config.ts`, and the guard in `app/api/coverage/route.ts`. A plain
`bun run build` therefore ships zero Istanbul counters — and a plain
`bun run dev` compiles faster.
(verified 2026-08-11 · `rg statementMap .next/server .next/static` → no hits
after a plain build, immediately following an instrumented one)

First-time setup:

```bash
bun install
bunx playwright install chromium
```

## How coverage works

1. `swc-plugin-coverage-instrument` runs as an SWC wasm plugin
   (`experimental.swcPlugins` in `next.config.ts`, registered only when
   `COVERAGE=1`), so every app source file — client *and* server — is compiled
   with Istanbul counters.
2. Counters are collected from three places, because they live in three kinds of
   process:

   | Source                            | Where the counters are               | How they get out                        |
   | --------------------------------- | ------------------------------------ | --------------------------------------- |
   | browser bundles                   | `window.__coverage__`                | `page.evaluate` after every test         |
   | the server under test             | `globalThis.__coverage__` in `next dev`/`next start` | `GET /api/coverage` after every test |
   | page-rendering worker processes   | `globalThis.__coverage__` in each worker | `scripts/coverage-exit.cjs`, on process exit |

   The third one is the whole reason production coverage beats dev coverage:
   `generateStaticParams` and every statically rendered Server Component run
   during `next build`, in ~15 short-lived static-generation workers whose
   globals nothing outside them can ever read. See "Build-time coverage" below.
3. The Playwright auto-fixture in `e2e/fixtures.ts` collects the first two after
   every test and writes each non-empty map to
   `.nyc_output/coverage-<kind>-<uuid>.json`. Either side may legitimately be
   empty for a given test, so a per-test miss is recorded as an annotation; the
   `coverage-guard` teardown project fails the run only if the whole suite
   produced nothing, which is the instrumentation-is-dead signal.
4. `scripts/coverage-report.ts` merges `.nyc_output/*.json` and emits `text`
   (stdout), `html` (`coverage/`), and `lcov`. It drops any entry whose recorded
   path has no file on disk — Next hands the instrumenter synthetic modules
   (`<component>.tsx/__nextjs-internal-proxy.mjs` boundary shims, `data:` module
   URLs, `<name>.mdx.tsx` compiled MDX) whose counters no reporter can render.

Server coverage is cumulative across the run (one server process, one global).
Re-reading it after every test is fine — Istanbul's merge is idempotent for
repeated identical maps.

## Build-time coverage

`scripts/coverage-exit.cjs` is preloaded into every process the toolchain
spawns, and writes `globalThis.__coverage__` to
`.nyc_output/coverage-build-<pid>.json` when its process goes away. It is inert
unless `COVERAGE=1`, and writes nothing from a process that never loaded an
instrumented module — which is most of them.

Two details are load-bearing, both established by experiment rather than
inference:

- **It is preloaded through `bunfig.toml`, not `NODE_OPTIONS`.** `node` on this
  toolchain is bun's node shim (`~/.local/bin/node` → `bun`), and it ignores
  `NODE_OPTIONS=--require` silently — the preload simply never loads. bun's own
  `preload` key does reach every child process started from this directory,
  including Turbopack's transform pools and Next's `jest-worker` children. The
  `coverage:build` script still sets `NODE_OPTIONS` as well, so the same command
  works on a toolchain whose `node` is really node; the module guards against
  being registered twice.
  (verified 2026-08-11 · same preload file under both runtimes: loaded by
  node 24.14.0, never loaded by the shim)
- **It handles `SIGHUP`/`SIGINT`/`SIGTERM`, not just `exit`.** Next shuts its
  static-generation workers down with a signal, and the default action for a
  signal is to terminate the process without ever emitting `exit`. With only an
  `exit` handler the run captured *zero* build dumps; with the signal handlers
  (flush, then `process.exit(0)`) it captures all 15.
  (observed 2026-08-11 · a logging preload across two builds)

The same mechanism pays off in dev, where Next also renders pages in worker
processes that `/api/coverage` cannot see: it is worth ~4 points of statement
coverage there (89.3% → 93.1%).

## Tests

- `e2e/playground.spec.ts` — one smoke test per demo route, derived from the
  app's own mock database (`app/_internal/_data.ts`), so a demo added upstream is
  covered for free. Two interaction tests (`/context`, `/error`) prove client JS
  actually hydrates.
- `e2e/deep-routes.spec.ts` — everything below `/<demo>`: `[section]`/`[category]`
  segments, route groups, parallel-route slots and their `default.tsx`, the
  product detail pages, and the `notFound()` guard on every dynamic segment.
  These are what exercise `lib/db.ts`'s `where` clauses.
- `e2e/interactions.spec.ts` — client behaviour a click is the only way to reach:
  layout-scoped state surviving a navigation, the collapsible readme, the
  segment-level error and not-found boundaries, a Server Action, the mobile nav.
- `e2e/helpers.ts` — shared locators. They live outside the spec files because a
  spec may not contain type annotations (see Notes).

The same 43 tests run in both modes, with no mode-aware assertions: everything
that differs between a dev server and a production one (the dev error overlay's
duplicate error text, runtime prefetching actually firing, statically rendered
pages not re-running per request) is already handled by assertions that hold
either way. `process.env.COVERAGE_MODE` is `dev`/`prod` if that ever stops being
true.

| Mode                   | Statements | Branches | Functions | Lines  | Wall clock                |
| ---------------------- | ---------- | -------- | --------- | ------ | ------------------------- |
| `bun run coverage`     | **93.77%** | 80.28%   | 93.62%    | 94.14% | 42s (14s build + 27s run) |
| `bun run coverage:dev` | 93.12%     | 80.48%   | 93.56%    | 93.50% | 2m55s                     |

(measured 2026-08-11 · 43 tests · 99 raw coverage files in prod, 15 of them
build-worker dumps. Expect ±0.05 between runs: which worker renders which page
shifts a few counters.)

Dropping just the worker dumps from the same `.nyc_output` and re-running
`bun run coverage:report` puts prod at 86.76% statements over 77 files and dev at
89.32% over 108 — that difference *is* the mechanism described above.

Production is ahead mainly on `generateStaticParams` (10 files) and on
`app/private-cache/_components/product-link.tsx`'s prefetch-tracking patch, which
only runs when Next actually prefetches. What remains uncovered in both:

| Blocked                                                        | Why                                                        |
| -------------------------------------------------------------- | ---------------------------------------------------------- |
| `app/api/og/route.tsx` (38% stmts)                              | no test drives it, and it 500s regardless — see Notes       |
| `lib/db.ts` `where: { id }` / `{ slug }` / `{ section }` arms    | mock-ORM query shapes no route in the template uses         |
| unimported exports (`ProductList`, `ProductListSkeleton`, `NextLogoLight`, `Counter`, `RecommendationsSkeleton`) | dead in this app |
| unreachable throws (`useCounter` outside its provider, `random()` on a non-string/number, the MDX `a` without an `href`) | guard clauses no call site can reach |
| `ui/codehike.tsx` `MyInlineCode` and `mark.Inline`               | codehike leaves plain inline code as `<code>`, and no readme uses inline annotations |
| `session-suffix.tsx` `regenerate()`                             | calls `location.reload()`, which discards `window.__coverage__` |
| `app/api/coverage/route.ts` 404 guard                            | only taken when `COVERAGE` is unset, i.e. when nothing is measuring |

## Notes

- `next` is pinned to `16.3.0-preview.9`, the template's own version. Dev and the
  e2e suite run fine on `16.3.0` stable, but `next build` does not:
  `app/private-cache/product/[id]/with-private/page.tsx` sets
  `export const prefetch = "allow-runtime"`, a segment config value stable
  rejects. Instrumentation was re-verified against the preview build by grepping
  a served chunk for `statementMap` — a successful compile proves nothing.
  (unverified 2026-08-11 · re-checking the stable rejection means installing
  `16.3.0` over the pin)
- Tests target `http://localhost:3100`, not `127.0.0.1`. Next 16's dev server
  answers 403 to requests whose `Host` is not an allowed dev origin, which
  starves the page of its chunks and leaves it unhydrated. `next start` has no
  such check, but both modes share the base URL rather than diverge for no
  reason.
- `reuseExistingServer: false`, in both modes. Playwright's default would let a
  dev server already listening on :3100 answer the entire production run, and
  the report would describe a build nobody made.
- `app/api/og` reads `request.url`, so Next marks it dynamic ("needs to bail out
  of prerendering") and never tries to prerender it — the build stays green
  without touching the route. It still fails at request time: it reads
  `Inter-SemiBold.ttf` from the repo root, which this template does not ship, and
  returns its own 500. That is why the route sits at 38% statements.
  (verified 2026-08-11 · `GET /api/og` on `next start` → 500 "Failed to generate
  the image", server logs `ENOENT … Inter-SemiBold.ttf`)
- `bun run coverage` leaves an *instrumented* build in `.next`. Run
  `bun run build` before `bun run start` if what you want is a production server
  that is not counting statements.
- Grepping a production build for leftover instrumentation must exclude
  `.next/dev`, which holds dev-server artifacts from a previous
  `bun run coverage:dev` and legitimately contains `statementMap`. The
  production output is `.next/server` and `.next/static`.
- `app/fonts.ts` is excluded from instrumentation. `next/font/google` calls must
  survive as bare module-scope `const` assignments, and the coverage plugin runs
  first and rewrites them into sequence expressions.
- The coverage endpoint is `app/api/coverage`, not `app/api/__coverage__` —
  Next treats `_`-prefixed directories as private and does not route them.
- A `*.spec.ts` must contain **no** TypeScript type annotations. Bun's loader
  fails on any of them — `const n: number = 1` is enough — and Playwright reports
  only `BuildMessage {}` followed by "No tests found", naming nothing. Imported
  modules are transformed normally, so anything needing types goes in
  `e2e/helpers.ts` or `e2e/fixtures.ts`.
- The dev server serves an empty Tailwind utility layer, so nothing on the page
  is ever `display: none` and `toBeHidden()` is meaningless — assert open/closed
  state on the class attribute instead. Tailwind v4 auto-detects its sources from
  the enclosing git root, and this directory has no `.git` of its own, so that
  root is the whole home directory. A `@source` directive in
  `styles/globals.css`, or a repository here, would fix it.
  (observed 2026-08-11 · the served CSS chunk ends at
  `@layer components, utilities;` with no utility rules)
- `workers: 1`. The server coverage endpoint is process-global shared state, and
  parallel workers also trigger a dev-server compile storm.
