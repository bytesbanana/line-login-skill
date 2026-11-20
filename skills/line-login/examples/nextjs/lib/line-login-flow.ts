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
