# Next.js App Router example

A worked implementation of the web flow: two route handlers plus the session helper. The same steps apply in any stack — the protocol is framework-independent.

Runnable copies live in `skills/line-login/examples/nextjs/`. This file embeds them verbatim.

Environment:

```
LINE_CHANNEL_ID=1234567890
LINE_CHANNEL_SECRET=...
LINE_REDIRECT_URI=http://localhost:3000/api/line/callback
SESSION_SECRET=...
```


## `lib/line-login-flow.ts` — framework-free logic

Everything worth testing lives here: the authorize URL, the code challenge, the callback classification, and the token request body. No `next/*` imports, so it can be unit tested directly.

```ts
import { createHash, randomBytes } from "node:crypto";

/**
 * Framework-free LINE Login logic. The route handlers only translate HTTP in and out;
 * everything worth testing lives here.
 */

export const AUTHORIZE_URL = "https://access.line.me/oauth2/v2.1/authorize";
export const TOKEN_URL = "https://api.line.me/oauth2/v2.1/token";
export const VERIFIER_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~";
export const SESSION_TTL_MS = 10 * 60 * 1000;

export type LoginSession = {
  state: string;
  nonce: string;
  codeVerifier: string;
  createdAt: number;
};

export function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export function randomString(length: number, chars: string = VERIFIER_CHARS): string {
  const limit = Math.floor(256 / chars.length) * chars.length;
  let out = "";
  while (out.length < length) {
    for (const byte of randomBytes(length)) {
      if (byte < limit) {
        out += chars[byte % chars.length];
        if (out.length === length) break;
      }
    }
  }
  return out;
}

export function codeChallenge(codeVerifier: string): string {
  return base64url(createHash("sha256").update(codeVerifier).digest());
}

export function createLoginSession(now: number = Date.now()): LoginSession {
  return {
    state: randomString(32),
    nonce: randomString(32),
    codeVerifier: randomString(64),
    createdAt: now,
  };
}

export function isSessionFresh(session: LoginSession, now: number = Date.now()): boolean {
  return now - session.createdAt <= SESSION_TTL_MS;
}

export function buildAuthorizeUrl(input: {
  clientId: string;
  redirectUri: string;
  scope: string;
  state: string;
  nonce: string;
  codeChallenge: string;
  uiLocales?: string;
  disableAutoLogin?: boolean;
}): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("scope", input.scope);
  url.searchParams.set("state", input.state);
  url.searchParams.set("nonce", input.nonce);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (input.uiLocales) url.searchParams.set("ui_locales", input.uiLocales);
  if (input.disableAutoLogin) url.searchParams.set("disable_auto_login", "true");
  return url.toString();
}

export type CallbackOutcome =
  | { kind: "state-mismatch" }
  | { kind: "declined"; error: string }
  | { kind: "missing-code" }
  | { kind: "ok"; code: string };

/**
 * Classify the callback. A state mismatch may be a CSRF attempt or an auto login failure —
 * both are handled the same way: show a retry, never accuse the user.
 */
export function classifyCallback(params: URLSearchParams, session: LoginSession | null): CallbackOutcome {
  const state = params.get("state");
  const code = params.get("code");
  const error = params.get("error");

  if (!session || !state || state !== session.state) return { kind: "state-mismatch" };
  if (error) return { kind: "declined", error };
  if (!code) return { kind: "missing-code" };
  return { kind: "ok", code };
}

export function buildTokenRequestBody(input: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  codeVerifier: string;
}): Record<string, string> {
  return {
    grant_type: "authorization_code",
    client_id: input.clientId,
    client_secret: input.clientSecret,
    code: input.code,
    redirect_uri: input.redirectUri,
    code_verifier: input.codeVerifier,
  };
}
```


## `lib/line-session.ts` — session cookie

Stores `state`, `nonce` and `code_verifier` in a signed, httpOnly cookie. Single use, 10 minute TTL, signature compared with `timingSafeEqual`.

```ts
import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  buildAuthorizeUrl,
  codeChallenge,
  createLoginSession,
  isSessionFresh,
  type LoginSession,
} from "./line-login-flow";

const SECRET = process.env.SESSION_SECRET ?? "dev-only-secret";

function sign(value: string): string {
  return createHmac("sha256", SECRET).update(value).digest("base64url");
}

export async function startLogin(): Promise<string> {
  const session = createLoginSession();
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");

  const jar = await cookies();
  jar.set("line_login", `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });

  return buildAuthorizeUrl({
    clientId: process.env.LINE_CHANNEL_ID ?? "",
    redirectUri: process.env.LINE_REDIRECT_URI ?? "",
    scope: "profile openid",
    state: session.state,
    nonce: session.nonce,
    codeChallenge: codeChallenge(session.codeVerifier),
  });
}

export async function takeLoginSession(): Promise<LoginSession | null> {
  const jar = await cookies();
  const raw = jar.get("line_login")?.value;
  if (!raw) return null;

  const [payload, signature] = raw.split(".");
  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature ?? "");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  const session = JSON.parse(Buffer.from(payload, "base64url").toString());
  if (!isSessionFresh(session)) return null;

  jar.delete("line_login"); // single use
  return session;
}
```


## `app/api/line/authorize/route.ts` — start the login

Redirects the browser to the LINE Login authorize endpoint.

```ts
import { redirect } from "next/navigation";
import { startLogin } from "../../../lib/line-session";

export async function GET() {
  redirect(await startLogin());
}
```


## `app/api/line/callback/route.ts` — handle the callback

Checks the state, classifies the callback, exchanges the code server-side, and redirects. The LINE tokens never reach the browser.

```ts
import { NextResponse } from "next/server";
import { takeLoginSession } from "../../../../../lib/line-session";
import { buildTokenRequestBody, classifyCallback } from "../../../../../lib/line-login-flow";

export async function GET(req: any) {
  const params = req.nextUrl.searchParams;
  const session = await takeLoginSession();
  const outcome = classifyCallback(params, session);

  switch (outcome.kind) {
    case "state-mismatch":
      // Could be CSRF, could be an auto login failure — do not tell the user "attack".
      return NextResponse.redirect(new URL("/login?error=login_failed", req.url), 302);
    case "declined":
      return NextResponse.redirect(new URL("/login?error=declined", req.url), 302);
    case "missing-code":
      return NextResponse.redirect(new URL("/login?error=missing_code", req.url), 302);
  }

  const res = await fetch("https://api.line.me/oauth2/v2.1/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(
      buildTokenRequestBody({
        clientId: process.env.LINE_CHANNEL_ID ?? "",
        clientSecret: process.env.LINE_CHANNEL_SECRET ?? "",
        code: outcome.code,
        redirectUri: process.env.LINE_REDIRECT_URI ?? "",
        codeVerifier: session!.codeVerifier,
      }),
    ),
  });
  if (!res.ok) {
    return NextResponse.redirect(new URL("/login?error=token_exchange_failed", req.url), 302);
  }
  const tokens = await res.json();

  // Verify the ID token server-side before trusting the user's identity:
  //   node scripts/line-login.mjs verify-id-token --offline --id-token "$ID_TOKEN" \
  //     --client-id "$LINE_CHANNEL_ID" --client-secret "$LINE_CHANNEL_SECRET" --nonce "$NONCE"
  // Then create your own session. The LINE tokens stay on the server.

  return NextResponse.redirect(new URL("/dashboard", req.url), 302);
}
```


## Notes

- The channel secret never leaves the server.
- Never send the LINE access token to the browser. Store it server-side, keyed by your own session.
- `redirect_uri` must exactly match the callback URL registered in the LINE Developers Console.
- The `state` cookie is single use and expires after 10 minutes.
- A `state` mismatch is reported as a failed login, never as an attack — see `web-login.md` §3.
- Cloudflare Workers: use `crypto.subtle` instead of `node:crypto` where Node APIs are unavailable; the flow is otherwise identical.

---

Source: based on the LINE Login web flow — see `web-login.md`, `pkce.md`, `tokens.md` · verified 2026-11-20
