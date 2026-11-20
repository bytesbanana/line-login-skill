# PKCE for LINE Login

PKCE (RFC 7636) prevents authorization code interception: even if a malicious app steals the redirect, it cannot redeem the code without the `code_verifier`.

LINE supports **only** `S256`. `plain` is not supported.

## The four steps

### 1. Generate `code_verifier`

Per RFC 7636, and as LINE documents it:

- Characters: half-width alphanumerics and `- . _ ~`
- Length: 43–128 characters

```
wJKN8qz5t8SSI9lMFhBB6qwNkQBkuPZoCxzRhwLRUo1
```

### 2. Generate `code_challenge`

Base64URL(SHA-256(code_verifier)) — strip padding, replace `+` with `-`, replace `/` with `_`.

For the verifier above:

```
BSCQwo_m8Wf0fpjmwkIKmPAJ1A7tiuRSNDnXzODS7QI
```

Node:

```js
import { createHash, randomBytes } from "node:crypto";

const base64url = (buf) =>
  buf.toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

const codeVerifier = randomBytes(48).toString("base64url").slice(0, 64); // 43–128 chars
const codeChallenge = base64url(createHash("sha256").update(codeVerifier).digest());
```

### 3. Send `code_challenge` in the authorization request

```
https://access.line.me/oauth2/v2.1/authorize?response_type=code&client_id=1234567890&redirect_uri=https%3A%2F%2Fexample.com%2Fauth&state=12345abcde&scope=profile%20openid&nonce=09876xyz&code_challenge={CODE_CHALLENGE}&code_challenge_method=S256
```

### 4. Send `code_verifier` when exchanging the code

```
POST https://api.line.me/oauth2/v2.1/token
```

Body: `grant_type=authorization_code`, `code`, `redirect_uri`, `client_id`, `client_secret`, `code_verifier`.

The platform verifies that SHA-256(code_verifier) matches the `code_challenge` it received. A mismatch fails the exchange.

## Rules

- Store the `code_verifier` **server-side**, bound to the login session, and delete it as soon as the code is exchanged. The browser never needs to see it.
- One verifier per login attempt. Never reuse across sessions.
- Keep PKCE even for confidential web clients. It costs one hash.

## Side benefit

Yahoo! JAPAN enables the email/password auto login for web apps that implement LINE Login with PKCE.

---

Source: [Implement PKCE for LINE Login](https://developers.line.biz/en/docs/line-login/integrate-pkce/) · verified 2026-11-20
