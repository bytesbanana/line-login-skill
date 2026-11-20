#!/usr/bin/env node
/**
 * check-sources — re-fetch every source URL in SOURCES.md and report HTTP status and title drift.
 *
 *   node scripts/check-sources.mjs            # report, exit 1 on failure
 *   node scripts/check-sources.mjs --quiet    # only print failures
 *
 * A source fails when it cannot be fetched, returns a non-2xx status, or its <title> no longer
 * matches the title recorded in SOURCES.md.
 */

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const sourcesPath = join(repoRoot, "SOURCES.md");

function parseSources(markdown) {
  const rows = [];
  for (const line of markdown.split("\n")) {
    if (!line.startsWith("| http")) continue;
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    const [url, feeds, title, verified] = cells;
    if (!url || !title) continue;
    rows.push({ url, feeds, title, verified });
  }
  return rows;
}

function titleOf(html) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) return null;
  return match[1].replace(/\s+/g, " ").trim().replace(/\s*\|\s*LINE Developers\s*$/, "");
}

const quiet = process.argv.includes("--quiet");
const markdown = await readFile(sourcesPath, "utf8");
const rows = parseSources(markdown);

if (rows.length === 0) {
  process.stderr.write(`No sources found in ${sourcesPath}\n`);
  process.exit(1);
}

const results = await Promise.all(
  rows.map(async (row) => {
    try {
      const res = await fetch(row.url, { redirect: "follow" });
      const html = await res.text();
      const title = titleOf(html);
      const drift = title && title !== row.title;
      return { ...row, status: res.status, actualTitle: title, drift, ok: res.ok && !drift };
    } catch (err) {
      return { ...row, status: 0, title: null, drift: false, ok: false, error: err.message };
    }
  }),
);

let failures = 0;
for (const result of results) {
  if (!result.ok) failures += 1;
  if (!quiet || !result.ok) {
    const state = result.ok ? "ok" : result.error ? `error: ${result.error}` : result.drift ? "title drift" : `status ${result.status}`;
    process.stdout.write(`${result.ok ? "✔" : "✖"} ${result.status || "-"} ${result.url} — ${state}\n`);
    if (result.drift) process.stdout.write(`    expected title: ${result.title}\n    actual title:   ${result.actualTitle}\n`);
  }
}

process.stdout.write(`\n${results.length - failures}/${results.length} sources OK\n`);
process.exit(failures === 0 ? 0 : 1);
