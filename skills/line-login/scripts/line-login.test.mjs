import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHmac, createHash } from "node:crypto";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "line-login.mjs");

/** Run the CLI and return { code, stdout, stderr, json }. */
function run(args, opts = {}) {
  return new Promise((resolve) => {
    execFile(process.execPath, [SCRIPT, ...args], { env: { ...process.env, ...(opts.env || {}) } }, (err, stdout, stderr) => {
      let json;
      try {
        json = JSON.parse(stdout);
      } catch {}
      resolve({ code: err ? (err.code ?? 1) : 0, stdout, stderr, json });
    });
  });
}

/** A throwaway LINE-like API that records requests and replays canned responses. */
async function fakeApi(routes) {
  const requests = [];
  const server = createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString();
      requests.push({ method: req.method, url: req.url, headers: req.headers, body });
      const route = routes[req.url.split("?")[0]];
      const [status, payload] = route ? route(req, body) : [404, { error: "not_found" }];
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(payload));
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise((r) => server.close(r)),
  };
}

function base64url(buf) {
  return buf.toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function mintIdToken(claims, secret) {
  const header = base64url(Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const payload = base64url(Buffer.from(JSON.stringify(claims)));
  const sig = base64url(createHmac("sha256", secret).update(`${header}.${payload}`).digest());
  return `${header}.${payload}.${sig}`;
}

// ---------------------------------------------------------------- contract

test("unknown subcommand fails with a JSON error on stderr and exit code 1", async () => {
  const r = await run(["nope"]);
  assert.equal(r.code, 1);
  assert.equal(r.stdout, "");
  const err = JSON.parse(r.stderr);
  assert.equal(typeof err.error.code, "string");
  assert.equal(typeof err.error.message, "string");
});

test("a missing required flag fails with a JSON error naming the flag", async () => {
  const r = await run(["authorize-url", "--client-id", "123"]);
  assert.equal(r.code, 1);
  const err = JSON.parse(r.stderr);
  assert.match(err.error.message, /redirect-uri/);
});

// ---------------------------------------------------------------- new-session

test("new-session returns state, nonce, code_verifier, code_challenge and an authorize URL", async () => {
  const r = await run(["new-session", "--client-id", "1234567890", "--redirect-uri", "https://example.com/cb", "--scope", "profile openid"]);
  assert.equal(r.code, 0);
  const s = r.json;
  assert.match(s.state, /^[A-Za-z0-9]{16,}$/);
  assert.match(s.nonce, /^[A-Za-z0-9]{16,}$/);
  assert.match(s.code_verifier, /^[A-Za-z0-9\-._~]{43,128}$/);
  assert.match(s.code_challenge, /^[A-Za-z0-9\-_]{43}$/);
  assert.ok(s.authorize_url.startsWith("https://access.line.me/oauth2/v2.1/authorize?"));
});

test("new-session values differ between calls", async () => {
  const args = ["new-session", "--client-id", "1234567890", "--redirect-uri", "https://example.com/cb", "--scope", "profile"];
  const a = (await run(args)).json;
  const b = (await run(args)).json;
  assert.notEqual(a.state, b.state);
  assert.notEqual(a.nonce, b.nonce);
  assert.notEqual(a.code_verifier, b.code_verifier);
});

test("code_challenge is the Base64URL SHA-256 of the code_verifier (RFC 7636 vector from the LINE docs)", async () => {
  const verifier = "wJKN8qz5t8SSI9lMFhBB6qwNkQBkuPZoCxzRhwLRUo1";
  const expected = "BSCQwo_m8Wf0fpjmwkIKmPAJ1A7tiuRSNDnXzODS7QI";
  const actual = base64url(createHash("sha256").update(verifier).digest());
  assert.equal(actual, expected);
});

test("new-session --save writes a readable session file with owner-only permissions", async () => {
  const dir = await mkdtemp(join(tmpdir(), "line-login-"));
  const file = join(dir, "session.json");
  const r = await run(["new-session", "--client-id", "1234567890", "--redirect-uri", "https://example.com/cb", "--scope", "profile", "--save", file]);
  assert.equal(r.code, 0);
  const saved = JSON.parse(await readFile(file, "utf8"));
  assert.equal(saved.state, r.json.state);
  assert.equal(saved.code_verifier, r.json.code_verifier);
  const mode = (await stat(file)).mode & 0o777;
  assert.equal(mode, 0o600);
});

// ---------------------------------------------------------------- authorize-url

test("authorize-url encodes every parameter the LINE Login authorize endpoint expects", async () => {
  const r = await run([
    "authorize-url",
    "--client-id", "1234567890",
    "--redirect-uri", "https://example.com/cb?key=value",
    "--scope", "profile openid",
    "--state", "abc123",
    "--nonce", "xyz789",
    "--pkce-challenge", "BSCQwo_m8Wf0fpjmwkIKmPAJ1A7tiuRSNDnXzODS7QI",
  ]);
  assert.equal(r.code, 0);
  const u = new URL(r.json.authorize_url);
  assert.equal(u.origin + u.pathname, "https://access.line.me/oauth2/v2.1/authorize");
  assert.equal(u.searchParams.get("response_type"), "code");
  assert.equal(u.searchParams.get("client_id"), "1234567890");
  assert.equal(u.searchParams.get("redirect_uri"), "https://example.com/cb?key=value");
  assert.equal(u.searchParams.get("scope"), "profile openid");
  assert.equal(u.searchParams.get("state"), "abc123");
  assert.equal(u.searchParams.get("nonce"), "xyz789");
  assert.equal(u.searchParams.get("code_challenge"), "BSCQwo_m8Wf0fpjmwkIKmPAJ1A7tiuRSNDnXzODS7QI");
  assert.equal(u.searchParams.get("code_challenge_method"), "S256");
});

test("authorize-url omits PKCE parameters when no challenge is given", async () => {
  const r = await run(["authorize-url", "--client-id", "1", "--redirect-uri", "https://example.com/cb", "--scope", "profile"]);
  const u = new URL(r.json.authorize_url);
  assert.equal(u.searchParams.has("code_challenge"), false);
  assert.equal(u.searchParams.has("code_challenge_method"), false);
});

// ---------------------------------------------------------------- token

test("token exchanges the authorization code and returns the token payload", async () => {
  const api = await fakeApi({
    "/oauth2/v2.1/token": () => [200, { access_token: "AT", refresh_token: "RT", id_token: "IT", expires_in: 2592000, scope: "profile", token_type: "Bearer" }],
  });
  const r = await run([
    "token",
    "--base-url", api.baseUrl,
    "--client-id", "1234567890",
    "--client-secret", "SECRET",
    "--code", "the-code",
    "--redirect-uri", "https://example.com/cb",
    "--code-verifier", "wJKN8qz5t8SSI9lMFhBB6qwNkQBkuPZoCxzRhwLRUo1",
  ]);
  await api.close();
  assert.equal(r.code, 0);
  assert.equal(r.json.access_token, "AT");
  assert.equal(r.json.expires_in, 2592000);
  const body = new URLSearchParams(api.requests[0].body);
  assert.equal(body.get("grant_type"), "authorization_code");
  assert.equal(body.get("code"), "the-code");
  assert.equal(body.get("redirect_uri"), "https://example.com/cb");
  assert.equal(body.get("code_verifier"), "wJKN8qz5t8SSI9lMFhBB6qwNkQBkuPZoCxzRhwLRUo1");
});

test("token reads the code_verifier from a saved session file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "line-login-"));
  const file = join(dir, "session.json");
  await run(["new-session", "--client-id", "1", "--redirect-uri", "https://example.com/cb", "--scope", "profile", "--save", file]);
  const api = await fakeApi({ "/oauth2/v2.1/token": () => [200, { access_token: "AT" }] });
  const r = await run(["token", "--base-url", api.baseUrl, "--client-id", "1", "--client-secret", "S", "--code", "c", "--redirect-uri", "https://example.com/cb", "--session", file]);
  await api.close();
  assert.equal(r.code, 0);
  assert.match(api.requests[0].body, /code_verifier=/);
});

test("token surfaces an API error as a JSON error with the HTTP status", async () => {
  const api = await fakeApi({ "/oauth2/v2.1/token": () => [400, { error: "invalid_grant" }] });
  const r = await run(["token", "--base-url", api.baseUrl, "--client-id", "1", "--client-secret", "S", "--code", "c", "--redirect-uri", "https://example.com/cb"]);
  await api.close();
  assert.equal(r.code, 1);
  const err = JSON.parse(r.stderr);
  assert.equal(err.error.status, 400);
});

test("the client secret never appears in the output", async () => {
  const api = await fakeApi({ "/oauth2/v2.1/token": () => [200, { access_token: "AT" }] });
  const r = await run(["token", "--base-url", api.baseUrl, "--client-id", "1", "--client-secret", "SUPERSECRET", "--code", "c", "--redirect-uri", "https://example.com/cb"]);
  await api.close();
  assert.equal(r.stdout.includes("SUPERSECRET"), false);
  assert.equal(r.stderr.includes("SUPERSECRET"), false);
});

// ---------------------------------------------------------------- refresh

test("refresh sends grant_type=refresh_token", async () => {
  const api = await fakeApi({ "/oauth2/v2.1/token": () => [200, { access_token: "AT2", refresh_token: "RT2", expires_in: 2592000 }] });
  const r = await run(["refresh", "--base-url", api.baseUrl, "--client-id", "1", "--client-secret", "S", "--refresh-token", "RT"]);
  await api.close();
  assert.equal(r.code, 0);
  assert.equal(r.json.access_token, "AT2");
  const body = new URLSearchParams(api.requests[0].body);
  assert.equal(body.get("grant_type"), "refresh_token");
  assert.equal(body.get("refresh_token"), "RT");
});

// ---------------------------------------------------------------- verify-token / profile / revoke

test("verify-token calls the verify endpoint with the access token", async () => {
  const api = await fakeApi({ "/oauth2/v2.1/verify": () => [200, { client_id: "1234567890", scope: "profile", expires_in: 2592000 }] });
  const r = await run(["verify-token", "--base-url", api.baseUrl, "--access-token", "AT"]);
  await api.close();
  assert.equal(r.code, 0);
  assert.equal(r.json.client_id, "1234567890");
  assert.match(api.requests[0].url, /access_token=AT/);
});

test("profile calls the profile endpoint with a bearer token", async () => {
  const api = await fakeApi({ "/v2/profile": () => [200, { userId: "U123", displayName: "Ada" }] });
  const r = await run(["profile", "--base-url", api.baseUrl, "--access-token", "AT"]);
  await api.close();
  assert.equal(r.code, 0);
  assert.equal(r.json.userId, "U123");
  assert.equal(api.requests[0].headers.authorization, "Bearer AT");
});

test("revoke posts the client credentials and access token", async () => {
  const api = await fakeApi({ "/oauth2/v2.1/revoke": () => [200, {}] });
  const r = await run(["revoke", "--base-url", api.baseUrl, "--client-id", "1", "--client-secret", "S", "--access-token", "AT"]);
  await api.close();
  assert.equal(r.code, 0);
  const body = new URLSearchParams(api.requests[0].body);
  assert.equal(body.get("access_token"), "AT");
  assert.equal(body.get("client_id"), "1");
});

// ---------------------------------------------------------------- verify-id-token (online)

test("verify-id-token posts the ID token and channel ID to the verify endpoint", async () => {
  const api = await fakeApi({ "/oauth2/v2.1/verify": () => [200, { client_id: "1234567890", scope: "openid", expires_in: 2592000 }] });
  const r = await run(["verify-id-token", "--base-url", api.baseUrl, "--id-token", "IT", "--client-id", "1234567890"]);
  await api.close();
  assert.equal(r.code, 0);
  const body = new URLSearchParams(api.requests[0].body);
  assert.equal(body.get("id_token"), "IT");
  assert.equal(body.get("client_id"), "1234567890");
});

// ---------------------------------------------------------------- verify-id-token (offline)

const NOW = Math.floor(Date.now() / 1000);
const validClaims = {
  iss: "https://access.line.me",
  aud: "1234567890",
  sub: "U123",
  exp: NOW + 3600,
  iat: NOW,
  nonce: "NONCE123",
};

test("verify-id-token --offline accepts a valid HS256 token", async () => {
  const idToken = mintIdToken(validClaims, "SECRET");
  const r = await run(["verify-id-token", "--offline", "--id-token", idToken, "--client-id", "1234567890", "--client-secret", "SECRET", "--nonce", "NONCE123"]);
  assert.equal(r.code, 0);
  assert.equal(r.json.aud, "1234567890");
  assert.equal(r.json.sub, "U123");
});

test("verify-id-token --offline rejects a tampered payload", async () => {
  const idToken = mintIdToken(validClaims, "SECRET");
  const [h, p, s] = idToken.split(".");
  const tampered = `${h}.${base64url(Buffer.from(JSON.stringify({ ...validClaims, sub: "U999" })))}.${s}`;
  const r = await run(["verify-id-token", "--offline", "--id-token", tampered, "--client-id", "1234567890", "--client-secret", "SECRET"]);
  assert.equal(r.code, 1);
  assert.match(JSON.parse(r.stderr).error.message, /signature/i);
});

test("verify-id-token --offline rejects a token signed with another secret", async () => {
  const idToken = mintIdToken(validClaims, "OTHER");
  const r = await run(["verify-id-token", "--offline", "--id-token", idToken, "--client-id", "1234567890", "--client-secret", "SECRET"]);
  assert.equal(r.code, 1);
});

test("verify-id-token --offline rejects a token issued for another channel", async () => {
  const idToken = mintIdToken({ ...validClaims, aud: "9999999999" }, "SECRET");
  const r = await run(["verify-id-token", "--offline", "--id-token", idToken, "--client-id", "1234567890", "--client-secret", "SECRET"]);
  assert.equal(r.code, 1);
  assert.match(JSON.parse(r.stderr).error.message, /aud/);
});

test("verify-id-token --offline rejects a mismatched nonce", async () => {
  const idToken = mintIdToken(validClaims, "SECRET");
  const r = await run(["verify-id-token", "--offline", "--id-token", idToken, "--client-id", "1234567890", "--client-secret", "SECRET", "--nonce", "EXPECTED"]);
  assert.equal(r.code, 1);
  assert.match(JSON.parse(r.stderr).error.message, /nonce/);
});

test("verify-id-token --offline rejects an expired token", async () => {
  const idToken = mintIdToken({ ...validClaims, exp: NOW - 10 }, "SECRET");
  const r = await run(["verify-id-token", "--offline", "--id-token", idToken, "--client-id", "1234567890", "--client-secret", "SECRET"]);
  assert.equal(r.code, 1);
  assert.match(JSON.parse(r.stderr).error.message, /exp/i);
});

test("verify-id-token --offline rejects a token issued by another issuer", async () => {
  const idToken = mintIdToken({ ...validClaims, iss: "https://evil.example" }, "SECRET");
  const r = await run(["verify-id-token", "--offline", "--id-token", idToken, "--client-id", "1234567890", "--client-secret", "SECRET"]);
  assert.equal(r.code, 1);
  assert.match(JSON.parse(r.stderr).error.message, /iss/);
});
