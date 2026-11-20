# LIFF boundary

LIFF apps run inside the LINE in-app browser. They do **not** use the raw authorization URL.

## Rules

1. **Use `liff.login()`, not the authorize URL.** The behavior of LINE Login authorization requests inside the LIFF browser is not guaranteed. When a LIFF app is opened from an external browser, call `liff.login()` — not an authorization request.
2. **`liff.init()` before anything.** It must be called on every page open, and on the endpoint URL or a URL lower in the path, otherwise it is not guaranteed to work.
3. **Tokens are `ES256`.** ID tokens obtained in a LIFF app are signed with ECDSA P-256, not with the channel secret (`HS256`). The offline verification helper in `line-login.mjs` only supports `HS256`; use the verify endpoint for LIFF tokens.
4. **The LIFF SDK verifies tokens client-side** — `liff.getIDToken()` and `liff.getAccessToken()` results can be trusted in the client. The **server** must still verify.
5. **Never send profile details from the client to the server.** Send the ID token or the access token; the server resolves the profile.
6. **The access token is revoked when the LIFF app is closed**, even if it had not expired.
7. **Do not log the LIFF URL.** The primary redirect URL carries `access_token=...`. LIFF v2.11.0 and later exclude credential information from the URL once `liff.init()` resolves — send the page view from the `then()` handler, and upgrade to ≥2.11.0 if you use analytics.

## Server-side verification of LIFF tokens

**ID token** — the client sends the ID token; the server verifies it and gets the profile:

```sh
curl -v -X POST https://api.line.me/oauth2/v2.1/verify \
  -d 'id_token={ID_TOKEN}' \
  -d 'client_id={CHANNEL_ID}'
```

**Access token** — the client sends the access token; the server verifies it and then reads the profile:

```sh
curl -v -X GET https://api.line.me/oauth2/v2.1/verify?access_token={ACCESS_TOKEN}
curl -v -X GET https://api.line.me/v2/profile -H 'Authorization: Bearer {ACCESS_TOKEN}'
```

## LIFF client flow (outline)

```js
const liff = await import("@line/liff");

await liff.init({ liffId: process.env.LIFF_ID });
if (!liff.isLoggedIn()) {
  await liff.login({ redirectUri: window.location.href });
}

const idToken = liff.getIDToken();       // send to the server, not the profile
const accessToken = liff.getAccessToken(); // alternative
```

For an external browser, `liff.init({ withLoginOnExternalBrowser: true })` can run `liff.login()` automatically at initialization; otherwise call `liff.login()` yourself, then call `liff.init()` again after the redirect.

## Native apps

Native apps should use the LINE SDK, not the raw web flow described in this skill. Native-app ID tokens are also `ES256`.

---

Source: [Using user data in LIFF apps and servers](https://developers.line.biz/en/docs/liff/using-user-profile/) · [Developing a LIFF app](https://developers.line.biz/en/docs/liff/developing-liff-apps/) · [LIFF API reference](https://developers.line.biz/en/reference/liff/) · verified 2026-11-20
