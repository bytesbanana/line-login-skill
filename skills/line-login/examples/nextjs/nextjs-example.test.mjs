import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildAuthorizeUrl,
  buildTokenRequestBody,
  classifyCallback,
  codeChallenge,
  createLoginSession,
  isSessionFresh,
} from "./lib/line-login-flow.ts";

const here = dirname(fileURLToPath(import.meta.url));

test("a login session carries a state, a nonce and a code verifier", () => {
  const session = createLoginSession();
  assert.match(session.state, /^[A-Za-z0-9\-._~]{32}$/);
  assert.match(session.nonce, /^[A-Za-z0-9\-._~]{32}$/);
  assert.match(session.codeVerifier, /^[A-Za-z0-9\-._~]{43,128}$/);
});

test("two login sessions never share a state", () => {
  assert.notEqual(createLoginSession().state, createLoginSession().state);
});

test("a session expires after ten minutes", () => {
  const session = createLoginSession(0);
  assert.equal(isSessionFresh(session, 60_000), true);
  assert.equal(isSessionFresh(session, 600_001), false);
});

test("the code challenge is the Base64URL SHA-256 of the verifier (RFC 7636 vector from the LINE docs)", () => {
  assert.equal(codeChallenge("wJKN8qz5t8SSI9lMFhBB6qwNkQBkuPZoCxzRhwLRUo1"), "BSCQwo_m8Wf0fpjmwkIKmPAJ1A7tiuRSNDnXzODS7QI");
});

test("the authorize URL carries every parameter the LINE Login endpoint expects", () => {
  const url = new URL(
    buildAuthorizeUrl({
      clientId: "1234567890",
      redirectUri: "https://example.com/api/line/callback",
      scope: "profile openid",
      state: "abc123",
      nonce: "xyz789",
      codeChallenge: "BSCQwo_m8Wf0fpjmwkIKmPAJ1A7tiuRSNDnXzODS7QI",
    }),
  );
  assert.equal(url.origin + url.pathname, "https://access.line.me/oauth2/v2.1/authorize");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("client_id"), "1234567890");
  assert.equal(url.searchParams.get("redirect_uri"), "https://example.com/api/line/callback");
  assert.equal(url.searchParams.get("scope"), "profile openid");
  assert.equal(url.searchParams.get("state"), "abc123");
  assert.equal(url.searchParams.get("nonce"), "xyz789");
  assert.equal(url.searchParams.get("code_challenge"), "BSCQwo_m8Wf0fpjmwkIKmPAJ1A7tiuRSNDnXzODS7QI");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
});

test("a callback with a mismatched state is a state mismatch, not a declined grant", () => {
  const session = createLoginSession();
  const outcome = classifyCallback(new URLSearchParams({ code: "c", state: "other" }), session);
  assert.equal(outcome.kind, "state-mismatch");
});

test("a callback without a session is a state mismatch", () => {
  assert.equal(classifyCallback(new URLSearchParams({ code: "c", state: "s" }), null).kind, "state-mismatch");
});

test("a callback with a matching state and an error is a declined grant", () => {
  const session = createLoginSession();
  const outcome = classifyCallback(new URLSearchParams({ error: "ACCESS_DENIED", state: session.state }), session);
  assert.equal(outcome.kind, "declined");
});

test("a callback with a matching state but no code is missing the code", () => {
  const session = createLoginSession();
  assert.equal(classifyCallback(new URLSearchParams({ state: session.state }), session).kind, "missing-code");
});

test("a callback with a matching state and a code is accepted", () => {
  const session = createLoginSession();
  const outcome = classifyCallback(new URLSearchParams({ code: "the-code", state: session.state }), session);
  assert.deepEqual(outcome, { kind: "ok", code: "the-code" });
});

test("the token request body carries the code verifier", () => {
  const body = buildTokenRequestBody({
    clientId: "1234567890",
    clientSecret: "secret",
    code: "the-code",
    redirectUri: "https://example.com/api/line/callback",
    codeVerifier: "wJKN8qz5t8SSI9lMFhBB6qwNkQBkuPZoCxzRhwLRUo1",
  });
  assert.equal(body.grant_type, "authorization_code");
  assert.equal(body.code, "the-code");
  assert.equal(body.code_verifier, "wJKN8qz5t8SSI9lMFhBB6qwNkQBkuPZoCxzRhwLRUo1");
  assert.equal(body.redirect_uri, "https://example.com/api/line/callback");
});

test("the reference file embeds the example files verbatim", async () => {
  const markdown = await readFile(join(here, "../../references/nextjs-example.md"), "utf8");
  const files = [
    "lib/line-login-flow.ts",
    "lib/line-session.ts",
    "app/api/line/authorize/route.ts",
    "app/api/line/callback/route.ts",
  ];
  for (const file of files) {
    const content = await readFile(join(here, file), "utf8");
    assert.ok(markdown.includes(content.trim()), `${file} is out of sync with references/nextjs-example.md`);
  }
});
