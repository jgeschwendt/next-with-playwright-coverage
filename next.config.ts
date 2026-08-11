import createMDX from "@next/mdx";
import { type CodeHikeConfig } from "codehike/mdx";
import type { NextConfig } from "next";

// Instrumentation is opt-in: `COVERAGE=1` arms it for `bun run coverage`
// (`next build` + `next start`) and `bun run coverage:dev`, while a plain
// `bun run build`/`bun run dev` compiles the app with no Istanbul counters in
// it at all. The same flag opens `app/api/coverage/route.ts`.
const coverage = process.env.COVERAGE === "1";

// Istanbul instrumentation, applied by SWC so it survives Turbopack. Both the
// client bundles (`window.__coverage__`) and the server modules
// (`globalThis.__coverage__`) are instrumented.
const coverageSwcPlugins: [string, Record<string, unknown>][] = [
  [
    "swc-plugin-coverage-instrument",
    {
      unstableExclude: [
        "**/node_modules/**",
        // Must stay un-instrumented — see the comment in app/fonts.ts.
        "**/app/fonts.ts",
      ],
    },
  ],
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  experimental: {
    inlineCss: true,
    ...(coverage ? { swcPlugins: coverageSwcPlugins } : {}),
  },
  // The template's product cards request quality 90; Next 16 warns per image
  // unless the quality is declared here.
  images: { qualities: [75, 90] },
  pageExtensions: ["js", "jsx", "mdx", "ts", "tsx"],
  partialPrefetching: true,
};

const codeHikeConfig = {
  components: { code: "MyCode", inlineCode: "MyInlineCode" },
} satisfies CodeHikeConfig;

const withMDX = createMDX({
  options: {
    recmaPlugins: [["recma-codehike", codeHikeConfig] as never],
    remarkPlugins: [["remark-codehike", codeHikeConfig] as never],
  },
});

export default withMDX(nextConfig);
