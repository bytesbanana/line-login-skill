# PLAN — `line-login` agent skill

## Goal

Ship an agent skill that lets an AI agent integrate LINE Login (v2.1) into a web app correctly and safely: OAuth 2.0 authorization code flow + OpenID Connect, PKCE (S256), access/refresh/ID token lifecycle, consent handling, and a LIFF handoff boundary.

Format follows the [Agent Skills](https://agentskills.io/) convention used by `vercel-labs/agent-skills` and by the sibling skill `line-flex-messages`.

## Scope

**In**

- Web app login flow: authorization URL, callback handling, `state`/`nonce`, consent screen, error redirects.
- PKCE with `code_challenge_method=S256` (mandatory in this skill).
- Access token lifecycle: issue, refresh, revoke, verify. Access token 30 days, refresh token 90 days after issue.
- ID token: claims, `HS256` (web login) vs `ES256` (LIFF/native), server-side verification, `POST /oauth2/v2.1/verify`.
- Scopes and consent: `profile`, `openid`, `email` (email requires separate LINE approval), consent revocation ("Unlink") consequences.
- Auto-login failure handling: `state` mismatch is ambiguous (auto-login failure vs. CSRF) → user-facing retry, not a security error.
- Operations: what to log, what to redact, `x-line-request-id`, rate limits.
- LIFF boundary: `liff.login()`, `liff.getIDToken()`, `liff.getAccessToken()`, server-side re-verification, token revoked on LIFF close, `ES256`.
- One worked Next.js App Router example (two route handlers).

**Out** (deliberate — see ADR-0003)

- Native app / LINE SDK login (LINE recommends the SDK, not the raw web flow).
- Bot linking (`bot_prompt`, `friendship_status_changed`).
- LINE Login button design and UI specs.
- LINE URL scheme (`https://line.me/R/...`, `https://liff.line.me/...`) as a post-login deep-link mechanism.
- LINE Login v2.0 endpoints (`/v2/oauth/*`). v2.1 only; no migration guide.

## Deliverables

**This session (phase 0)**

- [x] `PLAN.md` (this file)
- [x] `GLOSSARY.md` — locked domain terms
- [x] `docs/adr/0001-mirror-line-docs-into-references.md`
- [x] `docs/adr/0002-zero-dependency-node-scripts.md`
- [x] `docs/adr/0003-scope-excludes-native-bot-button-and-url-schemes.md`
- [x] Repo skeleton: `skills/line-login/{references,scripts}/`, `skills.sh.json`, `README.md`, `LICENSE`

**Phase 1 — skill content** (done)

- [x] `skills/line-login/SKILL.md` (≤500 lines)
- [x] 9 files in `skills/line-login/references/`
- [x] `skills/line-login/scripts/line-login.mjs` + `line-login.test.mjs`
- [x] `skills/line-login/scripts/check-sources.mjs`
- [x] `skills/line-login/scripts/sync-nextjs-example.mjs`
- [x] `skills/line-login/examples/nextjs/` — runnable Next.js example + its tests
- [x] `SOURCES.md` (root): source URL → what it feeds → verified date

## Repo layout

```
line-login-skill/
├── PLAN.md
├── GLOSSARY.md
├── SOURCES.md                     # source URL → what it feeds → verified date
├── README.md
├── LICENSE                        # MIT
├── skills.sh.json                 # registry, repo root
├── docs/adr/
│   ├── 0001-mirror-line-docs-into-references.md
│   ├── 0002-zero-dependency-node-scripts.md
│   └── 0003-scope-excludes-native-bot-button-and-url-schemes.md
└── skills/
    └── line-login/
        ├── SKILL.md               # agent entry point
        ├── references/            # 9 condensed reference files
        ├── scripts/
        │   ├── line-login.mjs     # CLI
        │   ├── line-login.test.mjs
        │   ├── check-sources.mjs  # doc drift check
        │   └── sync-nextjs-example.mjs
        └── examples/nextjs/       # runnable example + nextjs-example.test.mjs
```

Skill directory name: `line-login` (kebab-case). `SKILL.md` always uppercase.

## Registry — `skills.sh.json`

```json
{
  "$schema": "https://skills.sh/schemas/skills.sh.schema.json",
  "notGrouped": "bottom",
  "groupings": [
    {
      "title": "LINE",
      "description": "Skills for LINE Login — OAuth2/OIDC web login, PKCE, access/ID token management, and LIFF handoff.",
      "skills": ["line-login"]
    }
  ]
}
```

One registry, at the repo root. No duplicate inside the skill directory.

## `SKILL.md` spine

1. `## When to use` — activation triggers.
2. `## Mental model` — flow diagram:
   `authorize URL → LINE app consent → callback(code,state) → token exchange → access/refresh/ID token → app session`
3. `## Prerequisites` — channel ID/secret, callback URL registered in the LINE Developers Console, scope choices, `email` scope needs separate approval.
4. `## Implement` — the 6 steps: authorize → callback + `state` check → exchange code → verify ID token → create session → token lifecycle. Each step links to its reference file.
5. `## Security rules` — the 8 mandatory rules below.
6. `## Scripts` — CLI contract + examples.
7. `## Error handling` — `error=` codes and HTTP status codes → required action.
8. `## Common mistakes` — the real failure modes (see below).
9. `## References` — one line per reference file, with when to read it.
10. `## LIFF boundary` — short, in SKILL.md on purpose: the "used the raw authorize URL inside LIFF" mistake happens before any reference file is opened.

Frontmatter:

```yaml
---
name: line-login
description: Guidance for integrating LINE Login (v2.1) into a web app — OAuth2/OIDC authorization code flow, PKCE, access/refresh/ID tokens, scopes and consent, and LIFF handoff. Activate when adding LINE Login, implementing LINE Login PKCE, wiring the authorization callback, or debugging LINE Login token and state errors.
---
```

## Reference inventory (`skills/line-login/references/`)

Every file: condensed facts, exact parameter/field tables, source URL + `verified <YYYY-MM-DD>` footer.

| file | contents | source |
|---|---|---|
| `web-login.md` | authorize URL params (`client_id`, `redirect_uri`, `state`, `scope`, `nonce`, `ui_locales`, `disable_auto_login`), callback handling, `error=` codes, auto-login failure → `state` mismatch, consent-screen re-display rules | [Integrating LINE Login with your web app](https://developers.line.biz/en/docs/line-login/integrate-line-login/), [Handling auto login failure](https://developers.line.biz/en/docs/line-login/how-to-handle-auto-login-failure/) |
| `pkce.md` | `code_verifier` → `code_challenge` (SHA-256 → Base64URL), `S256` only, the 4 wiring steps into authorize + token | [Implement PKCE for LINE Login](https://developers.line.biz/en/docs/line-login/integrate-pkce/) |
| `tokens.md` | issue / refresh / revoke / verify access token, 30-day access token, 90-day refresh token, refresh expiry ⇒ re-prompt login, revoke on logout | [Managing access tokens](https://developers.line.biz/en/docs/line-login/managing-access-tokens/), [LINE Login v2.1 API reference](https://developers.line.biz/en/reference/line-login/) |
| `id-token.md` | JWT claims (`iss`, `sub`, `aud`, `exp`, `iat`, `nonce`, `name`, `picture`, `email`), `HS256` (web) vs `ES256` (LIFF/native), server-side signature verification, `nonce` check, `POST /oauth2/v2.1/verify` | [Get profile information from ID tokens](https://developers.line.biz/en/docs/line-login/verify-id-token/) |
| `users-and-consent.md` | scopes `profile`/`openid`/`email`, email-scope approval prerequisite, consent revocation ⇒ access/refresh tokens dead, per-provider User ID, `GET /v2/profile` | [Managing users](https://developers.line.biz/en/docs/line-login/managing-users/), [Managing authorized apps](https://developers.line.biz/en/docs/line-login/managing-authorized-apps/) |
| `api-v2.1.md` | endpoint table: method, path, request params, response fields, expiry, errors | [LINE Login v2.1 API reference](https://developers.line.biz/en/reference/line-login/) |
| `status-codes.md` | HTTP 400/401/403/429/500, `error=` codes, `x-line-request-id`, rate limits, what to log and what to redact | [Status codes](https://developers.line.biz/en/reference/line-login/#status-codes), [Development guidelines](https://developers.line.biz/en/docs/line-login/development-guidelines/) |
| `liff.md` | `liff.login()` vs raw authorize URL, `liff.getIDToken()`/`getAccessToken()`/`getDecodedIDToken()`, server-side re-verification, token revoked on close, `ES256`, external-browser rules, LIFF ≥2.11 credential stripping | LIFF docs (see `SOURCES.md`) |
| `nextjs-example.md` | Next.js App Router: `/api/line/authorize` + `/api/line/callback` route handlers, session snippet (optional), no `next-auth` integration | — |

`operations.md` was folded into `status-codes.md` (both answer "what to do when a request fails or what do I log"). 9 files total.

## Script CLI contract — `scripts/line-login.mjs`

```
node scripts/line-login.mjs <subcommand> [flags]
```

| subcommand | required flags | output |
|---|---|---|
| `new-session` | `--client-id`, `--redirect-uri`, `--scope` | `{state, nonce, code_verifier, code_challenge, authorize_url}` |
| `authorize-url` | `--client-id`, `--redirect-uri`, `--scope` | `{authorize_url}` |
| `token` | `--client-id`, `--client-secret`, `--code`, `--redirect-uri` | `{access_token, refresh_token, id_token?, expires_in, scope, token_type}` |
| `refresh` | `--client-id`, `--client-secret`, `--refresh-token` | `{access_token, refresh_token, expires_in, scope, token_type}` |
| `verify-token` | `--access-token` | `{client_id, scope, expires_in, ...}` |
| `verify-id-token` | `--id-token`, `--client-id` | `{client_id, scope, expires_in, ...}` + claim checks |
| `revoke` | `--client-id`, `--client-secret`, `--access-token` | `{revoked: true}` |
| `profile` | `--access-token` | `{userId, displayName, pictureUrl, statusMessage}` |

Flags and behavior

- `--base-url <url>`: API base URL, default `https://api.line.me`. Used by the tests to point the CLI at a local stub.
- `--session <file>`: read `code_verifier` / `state` / `nonce` from a JSON file written by `new-session --save <file>`. Local testing convenience only — never the production store.
- `--save <file>`: write the session JSON (mode 600).
- `--offline` (on `verify-id-token`): verify the signature locally — `HS256` with the channel secret, `ES256` with a public key — and check `iss`, `aud`, `exp`, `nonce`.
- Credentials: flags or env `LINE_CHANNEL_ID` / `LINE_CLIENT_SECRET`. Never echoed; masked as `***` in all output.
- Output contract: exactly one JSON object on stdout. Errors → JSON `{"error":{"code","message","status"}}` on stderr, exit 1. Status messages to stderr.
- Zero npm dependencies — Node built-ins only (`node:crypto`, `node:fs`, `node:url`).

## Security rules (mandatory in SKILL.md)

1. `client_secret` is server-side only — never in browser code, never in a URL, never in logs.
2. Never log `access_token`, `refresh_token`, `id_token`, authorization `code`, `code_verifier`, or `client_secret`. Mask `state`/`nonce`; log `x-line-request-id` for traceability.
3. Verify the ID token server-side — signature (`HS256` channel secret for web, `ES256` for LIFF/native) **and** `iss` (`https://access.line.me`), `aud` (channel ID), `exp`, `nonce`.
4. Bind `state` to the server-side session; single use; compare before exchanging the code. A mismatch is *possibly* an auto-login failure → show a retry, not a security error.
5. Exchange the code server-side, immediately, once. Never accept a token from the client.
6. Treat refresh-token expiry (90 days after issue) as "re-prompt login", never "refresh forever".
7. Honor consent revocation: after "Unlink" both tokens are dead — do not retry refresh, force re-login.
8. Use PKCE (`S256`) even for confidential web clients.

## Common mistakes to document

- Treating a `state` mismatch as a CSRF attack instead of a possible auto-login failure.
- Sending the token request without `code_verifier` in a PKCE flow.
- Requesting `email` scope without the prior LINE approval → consent screen never shows it.
- Retrying `refresh` after the user revoked consent.
- Logging tokens, codes, or the full authorize URL.
- "Verifying" an ID token by decoding it without checking the signature.
- Using the Messaging API *channel* access token where a LINE Login *user* access token is required (see `GLOSSARY.md`).

## Verification / acceptance checklist

Two commands, both offline except the source check:

```sh
node --test skills/line-login/                  # 36 tests: CLI contract + Next.js example
node skills/line-login/scripts/check-sources.mjs  # re-fetch every source URL, detect drift
node skills/line-login/scripts/sync-nextjs-example.mjs  # regenerate the example reference
```

Phase 1 is done when:

1. `SKILL.md` frontmatter parses; `name` = `line-login`; the description carries trigger phrases ("add LINE Login", "LINE Login PKCE", "implement LINE Login", "LINE Login token").
2. `SKILL.md` ≤ 500 lines; every `references/*.md` is linked from `SKILL.md`; no dead links.
3. `node --test skills/line-login/` passes: CLI contract, PKCE vector, ID token verification (tamper, wrong secret, wrong `aud`, wrong `nonce`, expired), and the Next.js example (authorize URL, state mismatch, code exchange, declined, failed exchange).
4. `code_challenge` reproduces the documented SHA-256 vector: `BSCQwo_m8Wf0fpjmwkIKmPAJ1A7tiuRSNDnXzODS7QI` for the documented `code_verifier`.
5. `node scripts/check-sources.mjs` reports every source `200` with no title drift; every reference file carries a `verified <date>` footer.
6. `references/nextjs-example.md` embeds the example files verbatim (enforced by a test, so the two cannot drift).
7. `skills.sh.json` matches the published schema's constraints: `groupings` with `title` + `skills`, `notGrouped` in `top|bottom`.

No live-credential E2E test against a real LINE channel (needs a real channel, secret, and a publicly reachable callback URL).

## Build order (phase 1)

1. Re-fetch and verify all source docs; record `verified` dates.
2. Write `GLOSSARY.md`-consistent wording into `references/*.md` (9 files, in the order of the inventory table).
3. Write `scripts/line-login.mjs`; satisfy checklist items 3–5.
4. Write `scripts/check-sources.mjs`; satisfy checklist item 6.
5. Write `SKILL.md` from the spine; satisfy checklist items 1–2.
6. Write `SOURCES.md`, `README.md` (activation + trademark disclaimer: LINE is a trademark of LY Corporation; not affiliated with or endorsed by LY Corporation).
7. Run the full acceptance checklist.

## Risks and open items

- **Doc drift.** LINE rewrites docs (e.g. LINE Corporation → LY Corporation). Mitigation: `check-sources.mjs` + per-file `verified` dates; re-verify before each release.
- **`email` scope.** Requires a separate LINE application for access to user email addresses — an app can ship without it and the skill must not imply it is granted by default.
- **Payload shape changes.** LINE states response JSON and ID token payloads may gain/reorder properties. The skill's code must tolerate unknown fields — documented, not enforced by a schema.
- **Auto-login vs. CSRF ambiguity.** LINE explicitly cannot distinguish them; the skill must present both possibilities and never leak the CSRF reasoning to the user-facing error.
- **LIFF token lifecycle.** LIFF access tokens are revoked when the LIFF app closes; the skill's LIFF section is deliberately short and pointer-only.
- **LIFF docs are not in the original 13-URL set.** `references/liff.md` pulls from LIFF documentation — to be recorded in `SOURCES.md` with its own verified date.

## Related work

- `line-flex-messages` (sibling skill, same house style, same `LINE` grouping).
- Possible future skill: `line-messaging` (Messaging API) — would share the registry's `LINE` grouping.
