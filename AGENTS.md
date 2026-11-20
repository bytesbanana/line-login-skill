# AGENTS.md

Guidance for agents working in this repository. This file is a **router**: it names the files to reach for and when. The authoritative content lives in those files, not here.

## What this repo is

One agent skill — `line-login` — that teaches an AI agent to integrate LINE Login v2.1 (web OAuth2/OIDC + PKCE) into an app, with a LIFF handoff boundary.

## Where to look

| Task | Reach for |
|---|---|
| Writing or changing the skill's guidance | `skills/line-login/SKILL.md` — the entry point; ≤500 lines, detail behind pointers |
| Protocol facts: authorize URL, callback, scopes, consent, token endpoints, status codes, LIFF | `skills/line-login/references/*.md` — one file per topic; SKILL.md's References section maps topic → file |
| Vocabulary: Channel ID, State, Code Challenge, access token vs channel access token | `GLOSSARY.md` — one canonical definition per term |
| Why a decision was made | `docs/adr/` — one paragraph per decision |
| Where a fact came from and whether it is still current | `SOURCES.md` — source URL → what it feeds → title → verified date |
| Helper CLI: login sessions, token exchange, ID token verification | `skills/line-login/scripts/line-login.mjs` — run `--help` for the subcommands |
| Runnable Next.js implementation | `skills/line-login/examples/nextjs/` |
| How the skill is published | `skills.sh.json` (repo root) |

## Updating the skill

Steps, in order:

1. Edit the file that owns the meaning: the reference file for a protocol fact, `SKILL.md` for guidance, `GLOSSARY.md` for a term, `docs/adr/` for a decision. One place per meaning.
2. Re-verify the upstream page and update its row in `SOURCES.md` (title and verified date).
3. If `examples/nextjs/` changed, regenerate the embedded copy: `node skills/line-login/scripts/sync-nextjs-example.mjs`.
4. Run `node --test skills/line-login/` — all tests pass.
5. Run `node skills/line-login/scripts/check-sources.mjs` — every source `200`, no title drift.
6. Commit with a conventional-commit message.

Done = tests pass, sources are clean, and every changed fact traces to a row in `SOURCES.md`.

## Conventions

- Reference files distil: facts, parameter tables, required behaviour. LINE's prose is not copied.
- Every reference file ends with `Source: <url> · verified <YYYY-MM-DD>`.
- Scripts use Node built-ins only — no npm dependencies. One JSON object on stdout; errors are JSON on stderr with exit code 1; secrets are never printed.
- Skill directory is `skills/line-login/` (kebab-case); the entry point is always `SKILL.md`.
- Scope is LINE Login v2.1 for web apps plus the LIFF handoff boundary — see `docs/adr/0003-scope-excludes-native-bot-button-and-url-schemes.md`.
