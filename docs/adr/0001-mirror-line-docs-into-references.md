# Mirror LINE docs into `references/` instead of fetching live

The skill ships condensed copies of the LINE Login documentation in `skills/line-login/references/*.md`, each with a source URL and a `verified <date>` footer, rather than fetching the docs at skill-use time.

Live fetching was rejected because it makes the skill's correctness depend on network access and on LINE's URL structure, and because an agent cannot tell a stale paraphrase from a current rule. The cost is drift, which we manage with `scripts/check-sources.mjs` (re-fetches every URL, reports status and title drift) and per-file verified dates. Use the hosted API reference for anything the skill does not cover.

## Consequences

- Reference files are the source of truth for this skill; they must be re-verified before each release.
- `SOURCES.md` at the repo root maps every source URL to the files it feeds.
- Never copy LINE prose verbatim — distil to facts, parameter tables, and required behaviors.
