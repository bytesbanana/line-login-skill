# ID tokens

An ID token is a JWT issued by the LINE Platform, compliant with OpenID Connect. It carries identity claims; it is not an access token and grants no API permission by itself.

## When you get one

- From the token response, when the `openid` scope was requested.
- In a LIFF app, from `liff.getIDToken()`.

## Header

| field | notes |
|---|---|
| `alg` | `HS256` (HMAC-SHA-256) for **web login**. `ES256` (ECDSA P-256 + SHA-256) for **native apps, LINE SDK, and LIFF apps**. |

## Payload

| claim | notes |
|---|---|
| `iss` | Always `https://access.line.me`. |
| `sub` | The user ID the token was issued for. |
| `aud` | The channel ID. |
| `exp` | Expiry, UNIX seconds. |
| `iat` | Issue time, UNIX seconds. |
| `nonce` | The nonce you sent in the authorization request. Absent if you sent none. |
| `name` | Display name. Present only if the `profile` scope was requested. |
| `picture` | Profile image URL. Present only if the `profile` scope was requested. |
| `email` | Email address. Present only if the `email` scope was requested and granted. |

```
{
  "iss": "https://access.line.me",
  "sub": "U4af4980629...",
  "aud": "1234567890",
  "exp": 1735689600,
  "iat": 1735686000,
  "nonce": "0987654asdf",
  "name": "Ada Lovelace",
  "picture": "https://profile.line-scdn.net/...",
  "email": "ada@example.com"
}
```

## Verification — always server-side

Decoding a JWT proves nothing. Verify:

1. **Signature.** `HS256` for web login — HMAC-SHA-256 with the channel secret. `ES256` for LIFF/native — the platform's public key.
2. `iss` is `https://access.line.me`.
3. `aud` is your channel ID.
4. `exp` is in the future.
5. `nonce` equals the value you sent in the authorization request (if you sent one).

Unless the ID token came directly from the LINE Platform, validate it on the server.

### Verify ID token endpoint

```sh
curl -v -X POST 'https://api.line.me/oauth2/v2.1/verify' \
  -d 'id_token={ID_TOKEN}' \
  -d 'client_id={CHANNEL_ID}'
```

Response `200`: `client_id`, `scope`, `expires_in` — and the profile information for the user.

Use this when you just need to validate a token and read the profile.

### Local verification (web login)

```
signature = HMAC-SHA-256(base64url(header) + "." + base64url(payload), channel_secret)
```

The helper script does this:

```sh
node scripts/line-login.mjs verify-id-token --offline \
  --id-token "$ID_TOKEN" --client-id "$LINE_CHANNEL_ID" --client-secret "$LINE_CLIENT_SECRET" \
  --nonce "$NONCE"
```

It rejects a tampered payload, a wrong secret, a wrong `aud`, a wrong `iss`, an expired token, and a mismatched nonce.

## Do not

- Do not trust profile data the browser decoded from the ID token. Re-verify server-side.
- Do not use the ID token as an API credential. Use the access token.
- Do not assume `email` is present — it needs the `email` scope *and* prior LINE approval.

---

Source: [Get profile information from ID tokens](https://developers.line.biz/en/docs/line-login/verify-id-token/) · [LINE Login v2.1 API reference](https://developers.line.biz/en/reference/line-login/) · verified 2026-11-20
