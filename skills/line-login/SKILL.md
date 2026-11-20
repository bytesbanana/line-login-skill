---
name: line-login
description: Guidance for integrating LINE Login (v2.1) into a web app — OAuth2/OIDC authorization code flow, PKCE, access/refresh/ID token lifecycle, scopes and consent, and LIFF handoff. Activate when adding LINE Login, implementing LINE Login PKCE, wiring the authorization callback, exchanging the authorization code, or debugging LINE Login token, state, and consent-revocation errors.
---

# line-login

## When to use

- Adding LINE Login to a web app (or a LIFF app).
- Wiring the authorization callback, the code exchange, or the ID token check.
- Deciding scopes, PKCE, token storage, and refresh.
- Debugging a LINE Login failure: `state` mismatch, invalid code, expired refresh token, `email` scope missing, consent revoked.

Not for: native apps (use the LINE SDK), the Messaging API, Flex Message layouts, bot linking.

## Mental model

```
browser ──▶ authorize URL (access.line.me) ──▶ user consents in LINE
                                                      │
callback ◀── ?code=…&state=…  (or ?error=…&state=…)  │
   │  1. compare state with the session value          │
   │  2. POST /oauth2/v2.1/token  (code + code_verifier) ──▶ access_token
   │  3. verify id_token (signature + iss + aud + exp + nonce)      refresh_token
   │  4. create YOUR session; keep LINE tokens on the server
   ▼
your app session
```

Two token kinds, never mixed: the **LINE Login access token** is user-scoped; the **channel access token** belongs to the Messaging API.

## Prerequisites

1. A LINE Login channel in the LINE Developers Console → **Channel ID** and **Channel secret**.
2. A callback URL registered on the channel (exact URL, including scheme and path).
3. Scope choices: `profile` (user ID, name, image), `openid` (ID token), `email` (**needs a separate LINE application for access to user email addresses** — ask for it only after approval).
4. Server-side storage for `state`, `nonce`, `code_verifier`, and the LINE tokens.

## Implement

### 1. Authorization request

Redirect the browser to `https://access.line.me/oauth2/v2.1/authorize` with `response_type=code`, `client_id`, `redirect_uri` (URL-encoded), `state`, `scope` (space-separated, `%20`), `nonce`, and — with PKCE — `code_challenge` + `code_challenge_method=S256`.

→ [`references/web-login.md`](references/web-login.md), [`references/pkce.md`](references/pkce.md)

### 2. Callback: check `state` first

Compare the callback's `state` with the value stored for this session. On mismatch, **do not** tell the user they were attacked: an auto login failure (private browsing, in-app browser) produces the same mismatch, and LINE cannot distinguish the two. Show a retry.

→ [`references/web-login.md`](references/web-login.md) §3

### 3. Exchange the code — server-side, once, immediately

`POST https://api.line.me/oauth2/v2.1/token` with `grant_type=authorization_code`, `code`, `redirect_uri`, `client_id`, `client_secret`, `code_verifier`.

→ [`references/tokens.md`](references/tokens.md), [`references/api-v2.1.md`](references/api-v2.1.md)

### 4. Verify the ID token

Verify the signature (`HS256` with the channel secret for web login; `ES256` for LIFF/native) and check `iss`, `aud`, `exp`, `nonce` — on the server. Or call `POST /oauth2/v2.1/verify` with the ID token and channel ID.

→ [`references/id-token.md`](references/id-token.md)

### 5. Create your own session

Your session, your cookie. The LINE access token, refresh token and ID token stay on the server.

### 6. Token lifecycle

Access token 30 days → refresh. Refresh token valid 90 days from the **original** issue and is not extended by refreshing; when it expires, send the user back through login. On logout: revoke. On user unregistration: revoke **and** deauthorize (`POST /user/v1/deauthorize`).

→ [`references/tokens.md`](references/tokens.md)

## Security rules

1. `client_secret` is server-side only — never in browser code, never in a URL, never in a log.
2. Never log `access_token`, `refresh_token`, `id_token`, the authorization `code`, or `code_verifier`. Mask `state`/`nonce`. Log `x-line-request-id`.
3. Verify the ID token server-side: signature **and** `iss`, `aud`, `exp`, `nonce`.
4. Bind `state` to the server-side session; single use; compare in constant time.
5. Exchange the code server-side, immediately, once. Never accept a token from the client.
6. Refresh-token expiry means "log in again", never "refresh forever".
7. Consent revoked ("Unlink") kills both tokens — do not retry the refresh.
8. Use PKCE (`S256`) even for confidential web clients.

## Scripts

`scripts/line-login.mjs` — zero dependencies, Node built-ins only. One JSON object on stdout; errors are JSON on stderr with exit code 1.

```sh
# Generate state, nonce, code_verifier and the authorize URL
node scripts/line-login.mjs new-session --client-id "$LINE_CHANNEL_ID" \
  --redirect-uri "https://example.com/api/line/callback" --scope "profile openid"

# Exchange the code (add --session <file> to reuse the saved code_verifier)
node scripts/line-login.mjs token --client-id "$LINE_CHANNEL_ID" --client-secret "$LINE_CLIENT_SECRET" \
  --code "$CODE" --redirect-uri "https://example.com/api/line/callback" --code-verifier "$VERIFIER"

# Verify an ID token locally (HS256, channel secret) or online
node scripts/line-login.mjs verify-id-token --offline --id-token "$ID_TOKEN" \
  --client-id "$LINE_CHANNEL_ID" --client-secret "$LINE_CLIENT_SECRET" --nonce "$NONCE"

# Refresh, verify, revoke, profile
node scripts/line-login.mjs refresh --client-id … --client-secret … --refresh-token …
node scripts/line-login.mjs verify-token --access-token …
node scripts/line-login.mjs revoke --client-id … --client-secret … --access-token …
node scripts/line-login.mjs profile --access-token …
```

Credentials can come from `LINE_CHANNEL_ID` / `LINE_CLIENT_SECRET`. Secrets are never echoed.

Subcommands: `new-session`, `authorize-url`, `token`, `refresh`, `verify-token`, `verify-id-token`, `revoke`, `profile`. Run `--help` for flags.

## Error handling

| situation | cause | app behavior |
|---|---|---|
| Callback `error=ACCESS_DENIED` | user declined, or the request failed | Show a retry. |
| Callback `error=UNSUPPORTED_RESPONSE_TYPE` / `INVALID_SCOPE` | bad parameters | Bug in your app. |
| Callback `error=SERVER_ERROR` | platform error | Retry later. |
| `state` mismatch | CSRF **or** auto login failure | Show a retry, no accusation. |
| `400` on token exchange | invalid/expired/revoked token, invalid code | Re-run login. |
| `400` on refresh | refresh token expired | Re-run login. |
| `401` | wrong `Authorization` header | Fix the header. |
| `403` | channel not authorized for the API | Check the channel/plan. |
| `413` | request over 2 MB | Shrink it. |
| `429` | rate limit | Back off with jitter. |
| `500` | platform error | Retry later. |

→ [`references/status-codes.md`](references/status-codes.md)

## Common mistakes

- Treating a `state` mismatch as an attack instead of a possible auto login failure.
- Sending the token request without `code_verifier` in a PKCE flow.
- Asking for the `email` scope without the prior LINE approval, then expecting an email.
- Retrying `refresh` after the user revoked consent.
- Logging tokens, codes, or the full authorize URL.
- "Verifying" an ID token by decoding it.
- Using the Messaging API channel access token where a LINE Login user access token is required.
- Keeping the LINE access token in a browser cookie.

## References

| file | read it when |
|---|---|
| [`references/web-login.md`](references/web-login.md) | building the authorize URL, handling the callback, deciding what a `state` mismatch means |
| [`references/pkce.md`](references/pkce.md) | implementing PKCE, generating a code verifier/challenge |
| [`references/tokens.md`](references/tokens.md) | issuing, refreshing, revoking, deauthorizing tokens |
| [`references/id-token.md`](references/id-token.md) | verifying the ID token, reading its claims |
| [`references/users-and-consent.md`](references/users-and-consent.md) | choosing scopes, handling consent and revocation, user IDs |
| [`references/api-v2.1.md`](references/api-v2.1.md) | exact endpoint paths, parameters, response fields |
| [`references/status-codes.md`](references/status-codes.md) | an API call failed; what to log and redact |
| [`references/liff.md`](references/liff.md) | the app runs in a LIFF browser |
| [`references/nextjs-example.md`](references/nextjs-example.md) | you want a worked Next.js App Router implementation |

## LIFF boundary

Inside a LIFF app use `liff.login()`, never the raw authorize URL. LIFF ID tokens are `ES256`, not `HS256`. The LIFF SDK verifies tokens in the client, but **the server must verify again** (`POST /oauth2/v2.1/verify` with the ID token, or `GET /oauth2/v2.1/verify` + `GET /v2/profile` with the access token). Never send profile details from the client to the server. The access token is revoked when the LIFF app closes. → [`references/liff.md`](references/liff.md)

Native apps: use the LINE SDK, not this flow.
