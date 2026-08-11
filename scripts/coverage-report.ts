#!/usr/bin/env bun
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import libCoverage from "istanbul-lib-coverage";
import libReport from "istanbul-lib-report";
import reports from "istanbul-reports";

const CWD = process.cwd();
const NYC_OUTPUT = path.join(CWD, ".nyc_output");
const REPORT_DIR = path.join(CWD, "coverage");

const entries = await readdir(NYC_OUTPUT).catch(() => {
  throw new Error(`No coverage input: ${NYC_OUTPUT} does not exist.`);
});
const files = entries.filter((entry) => entry.endsWith(".json")).sort();

if (files.length === 0) {
  throw new Error(`No coverage input: ${NYC_OUTPUT} contains no *.json files.`);
}

// Next hands the instrumenter a few modules that have no file on disk:
// `<component>.tsx/__nextjs-internal-proxy.mjs` shims for the Server/Client
// boundary, and `<name>.mdx.tsx` for compiled MDX. Their counters are real but
// the reporters cannot read a source for them, so drop anything whose recorded
// path does not resolve to an actual file in the repo. That also covers stray
// node_modules/.next entries if unstableExclude ever slips.
const isRealSource = (file: string) =>
  existsSync(path.resolve(CWD, file)) &&
  !file.includes("node_modules") &&
  !file.includes(".next/");

const map = libCoverage.createCoverageMap({});
const dropped = new Set<string>();

for (const file of files) {
  const raw = await readFile(path.join(NYC_OUTPUT, file), "utf8");
  const data = JSON.parse(raw) as libCoverage.CoverageMapData;

  for (const [key, entry] of Object.entries(data)) {
    if (isRealSource(entry.path ?? key)) {
      map.merge({ [key]: entry });
    } else {
      dropped.add(key);
    }
  }
}

const context = libReport.createContext({
  coverageMap: map,
  defaultSummarizer: "nested",
  dir: REPORT_DIR,
  watermarks: {
    branches: [50, 80],
    functions: [50, 80],
    lines: [50, 80],
    statements: [50, 80],
  },
});

for (const name of ["html", "lcovonly", "text"] as const) {
  reports.create(name).execute(context);
}

console.log(
  `\nMerged ${files.length} coverage file(s) covering ${map.files().length} source file(s).`,
);

if (dropped.size > 0) {
  console.log(
    `Filtered ${dropped.size} synthetic module(s) with no source on disk (e.g. ${[...dropped][0]}).`,
  );
}
console.log(`HTML report: ${path.join(REPORT_DIR, "index.html")}`);
