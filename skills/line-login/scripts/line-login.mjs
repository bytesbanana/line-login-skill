#!/usr/bin/env node
/**
 * line-login — helper CLI for the LINE Login v2.1 web flow.
 *
 * One JSON object on stdout per invocation; errors are JSON on stderr with exit code 1.
 * Zero dependencies: Node built-ins only.
 *
 *   node scripts/line-login.mjs <subcommand> [flags]
 *   node scripts/line-login.mjs --help
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { readFile } from "node:fs/promises";

const DEFAULT_BASE_URL = "https://api.line.me";
const AUTHORIZE_URL = "https://access.line.me/oauth2/v2.1/authorize";
const ISSUER = "https://access.line.me";
const VERIFIER_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~";
const STATE_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

class CliError extends Error {
  constructor(code, message, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function base64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function randomString(length, chars) {
  // Rejection sampling: no modulo bias over the alphabet.
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

function codeChallenge(codeVerifier) {
  return base64url(createHash("sha256").update(codeVerifier).digest());
}

function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      if (eq !== -1) {
        flags[arg.slice(2, eq)] = arg.slice(eq + 1);
      } else {
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith("--")) {
          flags[arg.slice(2)] = next;
          i += 1;
        } else {
          flags[arg.slice(2)] = true;
        }
      }
    } else {
      positional.push(arg);
    }
  }
  return { flags, positional };
}

function requireFlag(flags, name, subcommand) {
  const value = flags[name];
  if (value === undefined || value === true || value === "") {
    throw new CliError("missing_flag", `Missing required flag --${name} for '${subcommand}'`);
  }
  return value;
}

function clientId(flags) {
  return flags["client-id"] || process.env.LINE_CHANNEL_ID;
}

function clientSecret(flags) {
  return flags["client-secret"] || process.env.LINE_CLIENT_SECRET;
}

function baseUrl(flags) {
  return flags["base-url"] || process.env.LINE_API_BASE_URL || DEFAULT_BASE_URL;
}

function scopeList(flags) {
  const raw = requireFlag(flags, "scope", "authorize");
  return raw.split(/\s+/).filter(Boolean);
}

async function readSession(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (err) {
    throw new CliError("session_unreadable", `Could not read session file: ${err.message}`);
  }
}

async function postForm(url, form) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
  });
  const text = await res.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }
  if (!res.ok) {
    throw new CliError("api_error", payload.error_description || payload.error || `Request failed with status ${res.status}`, res.status);
  }
  return payload;
}

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers });
  const text = await res.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }
  if (!res.ok) {
    throw new CliError("api_error", payload.error_description || payload.error || `Request failed with status ${res.status}`, res.status);
  }
  return payload;
}

function buildAuthorizeUrl({ clientId: cid, redirectUri, scope, state, nonce, challenge, uiLocales, disableAutoLogin }) {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", cid);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", scope.join(" "));
  if (state) url.searchParams.set("state", state);
  if (nonce) url.searchParams.set("nonce", nonce);
  if (challenge) {
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
  }
  if (uiLocales) url.searchParams.set("ui_locales", uiLocales);
  if (disableAutoLogin) url.searchParams.set("disable_auto_login", "true");
  return url.toString();
}

function decodeJwtPart(part) {
  try {
    return JSON.parse(Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
  } catch {
    throw new CliError("invalid_id_token", "ID token is not a well-formed JWT");
  }
}

function verifyIdTokenOffline(idToken, { secret, expectedClientId, expectedNonce }) {
  const parts = String(idToken || "").split(".");
  if (parts.length !== 3) throw new CliError("invalid_id_token", "ID token is not a well-formed JWT");
  const [headerPart, payloadPart, signaturePart] = parts;

  const header = decodeJwtPart(headerPart);
  if (header.alg !== "HS256") {
    throw new CliError("unsupported_alg", `Unsupported ID token algorithm '${header.alg}'. Verify online, or use ES256 with the public key for LIFF and native apps.`);
  }
  if (!secret) throw new CliError("missing_flag", "Missing --client-secret (or LINE_CLIENT_SECRET) for offline verification");

  const expected = createHmac("sha256", secret).update(`${headerPart}.${payloadPart}`).digest();
  const actual = Buffer.from(signaturePart.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new CliError("invalid_signature", "ID token signature verification failed");
  }

  const claims = decodeJwtPart(payloadPart);
  if (claims.iss !== ISSUER) {
    throw new CliError("invalid_issuer", `ID token issuer '${claims.iss}' is not '${ISSUER}'`);
  }
  if (expectedClientId && claims.aud !== expectedClientId) {
    throw new CliError("invalid_audience", `ID token audience '${claims.aud}' is not the channel ID '${expectedClientId}'`);
  }
  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== "number" || claims.exp <= now) {
    throw new CliError("expired_id_token", "ID token has expired");
  }
  if (expectedNonce !== undefined && claims.nonce !== expectedNonce) {
    throw new CliError("nonce_mismatch", "ID token nonce does not match the value sent in the authorization request");
  }
  return claims;
}

const SUBCOMMANDS = {
  async "new-session"(flags) {
    const cid = requireFlag(flags, "client-id", "new-session");
    const redirectUri = requireFlag(flags, "redirect-uri", "new-session");
    const scope = scopeList(flags);
    const usePkce = flags["no-pkce"] !== true;

    const state = randomString(32, STATE_CHARS);
    const nonce = randomString(32, STATE_CHARS);
    const codeVerifier = usePkce ? randomString(64, VERIFIER_CHARS) : undefined;
    const challenge = usePkce ? codeChallenge(codeVerifier) : undefined;

    const session = {
      state,
      nonce,
      code_verifier: codeVerifier,
      code_challenge: challenge,
      authorize_url: buildAuthorizeUrl({
        clientId: cid,
        redirectUri,
        scope,
        state,
        nonce,
        challenge,
        uiLocales: flags["ui-locales"],
        disableAutoLogin: flags["disable-auto-login"] === true,
      }),
    };

    if (flags.save && flags.save !== true) {
      await writeFile(flags.save, `${JSON.stringify(session, null, 2)}\n`, { mode: 0o600 });
    }
    return session;
  },

  async "authorize-url"(flags) {
    const cid = requireFlag(flags, "client-id", "authorize-url");
    const redirectUri = requireFlag(flags, "redirect-uri", "authorize-url");
    const scope = scopeList(flags);
    return {
      authorize_url: buildAuthorizeUrl({
        clientId: cid,
        redirectUri,
        scope,
        state: flags.state === true ? undefined : flags.state,
        nonce: flags.nonce === true ? undefined : flags.nonce,
        challenge: flags["pkce-challenge"] === true ? undefined : flags["pkce-challenge"],
        uiLocales: flags["ui-locales"],
        disableAutoLogin: flags["disable-auto-login"] === true,
      }),
    };
  },

  async token(flags) {
    const cid = requireFlag(flags, "client-id", "token");
    const secret = requireFlag(flags, "client-secret", "token");
    const code = requireFlag(flags, "code", "token");
    const redirectUri = requireFlag(flags, "redirect-uri", "token");

    let codeVerifier = flags["code-verifier"];
    if ((codeVerifier === undefined || codeVerifier === true) && flags.session && flags.session !== true) {
      const session = await readSession(flags.session);
      codeVerifier = session.code_verifier;
    }
    if (codeVerifier === true) codeVerifier = undefined;

    const form = {
      grant_type: "authorization_code",
      client_id: cid,
      client_secret: secret,
      code,
      redirect_uri: redirectUri,
    };
    if (codeVerifier) form.code_verifier = codeVerifier;

    return postForm(`${baseUrl(flags)}/oauth2/v2.1/token`, form);
  },

  async refresh(flags) {
    const cid = requireFlag(flags, "client-id", "refresh");
    const secret = requireFlag(flags, "client-secret", "refresh");
    const refreshToken = requireFlag(flags, "refresh-token", "refresh");
    return postForm(`${baseUrl(flags)}/oauth2/v2.1/token`, {
      grant_type: "refresh_token",
      client_id: cid,
      client_secret: secret,
      refresh_token: refreshToken,
    });
  },

  async "verify-token"(flags) {
    const accessToken = requireFlag(flags, "access-token", "verify-token");
    const url = new URL(`${baseUrl(flags)}/oauth2/v2.1/verify`);
    url.searchParams.set("access_token", accessToken);
    return getJson(url.toString());
  },

  async "verify-id-token"(flags) {
    const idToken = requireFlag(flags, "id-token", "verify-id-token");
    const cid = requireFlag(flags, "client-id", "verify-id-token");
    const secret = clientSecret(flags);
    const expectedNonce = flags.nonce === true ? undefined : flags.nonce;

    if (flags.offline === true) {
      const claims = verifyIdTokenOffline(idToken, { secret, expectedClientId: cid, expectedNonce });
      return { ...claims, verified: "offline" };
    }
    return postForm(`${baseUrl(flags)}/oauth2/v2.1/verify`, { id_token: idToken, client_id: cid });
  },

  async revoke(flags) {
    const cid = requireFlag(flags, "client-id", "revoke");
    const secret = requireFlag(flags, "client-secret", "revoke");
    const accessToken = requireFlag(flags, "access-token", "revoke");
    await postForm(`${baseUrl(flags)}/oauth2/v2.1/revoke`, {
      client_id: cid,
      client_secret: secret,
      access_token: accessToken,
    });
    return { revoked: true };
  },

  async profile(flags) {
    const accessToken = requireFlag(flags, "access-token", "profile");
    return getJson(`${baseUrl(flags)}/v2/profile`, { authorization: `Bearer ${accessToken}` });
  },
};

const HELP = `line-login — helper CLI for the LINE Login v2.1 web flow

Usage: node scripts/line-login.mjs <subcommand> [flags]

Subcommands:
  new-session       Generate state, nonce, code_verifier and the authorize URL
  authorize-url     Build an authorize URL from explicit parameters
  token             Exchange an authorization code for tokens
  refresh           Exchange a refresh token for a new access token
  verify-token      Verify an access token
  verify-id-token   Verify an ID token (online, or --offline for local signature checks)
  revoke            Revoke an access token
  profile           Fetch the user's profile

Common flags:
  --client-id <id>            LINE Login channel ID (env: LINE_CHANNEL_ID)
  --client-secret <secret>    Channel secret (env: LINE_CLIENT_SECRET)
  --base-url <url>            API base URL (default: ${DEFAULT_BASE_URL})
  --help                      Show this help

Run 'node scripts/line-login.mjs <subcommand> --help' for per-subcommand flags.
`;

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h" || argv[0] === "help") {
    process.stdout.write(HELP);
    return;
  }

  const { flags, positional } = parseArgs(argv);
  const name = positional[0];
  const subcommand = SUBCOMMANDS[name];
  if (!subcommand) {
    throw new CliError("unknown_subcommand", `Unknown subcommand '${name}'. Run --help for the list.`);
  }
  if (flags.help === true) {
    process.stdout.write(`${HELP}\nFlags for '${name}':\n${SUBCOMMAND_FLAGS[name] ?? "(see --help)"}\n`);
    return;
  }

  const result = await subcommand(flags);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

const SUBCOMMAND_FLAGS = {
  "new-session": "  --client-id --redirect-uri --scope [--save <file>] [--no-pkce] [--ui-locales] [--disable-auto-login]",
  "authorize-url": "  --client-id --redirect-uri --scope [--state] [--nonce] [--pkce-challenge] [--ui-locales] [--disable-auto-login]",
  token: "  --client-id --client-secret --code --redirect-uri [--code-verifier] [--session <file>]",
  refresh: "  --client-id --client-secret --refresh-token",
  "verify-token": "  --access-token",
  "verify-id-token": "  --id-token --client-id [--client-secret] [--nonce] [--offline]",
  revoke: "  --client-id --client-secret --access-token",
  profile: "  --access-token",
};

main().catch((err) => {
  const payload = {
    error: {
      code: err.code ?? "unexpected_error",
      message: err.message,
      ...(err.status ? { status: err.status } : {}),
    },
  };
  process.stderr.write(`${JSON.stringify(payload)}\n`);
  process.exit(1);
});
