# Access and refresh tokens

LINE Login tokens are **user-scoped**: they represent one user of one provider. They are not the Messaging API *channel* access token — see `../../GLOSSARY.md`.

## Validity

| token | validity |
|---|---|
| Access token | 30 days (2592000 s) from issue. |
| Refresh token | Up to 90 days **after the access token was issued**. |

The refresh window is measured from the original issue, not from the last refresh: refreshing does **not** extend it. When it expires, the user must log in again.

## Issue access token

`POST https://api.line.me/oauth2/v2.1/token`

Body (form-encoded):

| parameter | required | notes |
|---|---|---|
| `grant_type` | yes | `authorization_code` |
| `code` | yes | The authorization code from the callback. Single use. |
| `redirect_uri` | yes | The same value sent in the authorization request. |
| `client_id` | yes | Channel ID. Required when authenticating by request body. |
| `client_secret` | depends | Required when authenticating by request body for channels whose app type is only *Web app*. Ignored for channels whose app type is *Mobile app and Web app* or only *Mobile app*. |
| `code_verifier` | if PKCE | See `pkce.md`. |

Alternative authentication: `Authorization: Basic base64(client_id:client_secret)`.

Response `200`:

| field | notes |
|---|---|
| `access_token` | The user access token. |
| `expires_in` | Seconds until expiry. |
| `id_token` | JWT — only when `openid` was requested. |
| `refresh_token` | Present when the app can refresh. |
| `scope` | Granted scopes. `email` is **never** listed here, even when granted. |
| `token_type` | `Bearer` |

```sh
curl -v -X POST https://api.line.me/oauth2/v2.1/token \
  --data-urlencode 'redirect_uri=https://example.com/auth?key=value' \
  --data-urlencode 'grant_type=authorization_code' \
  --data-urlencode 'code={AUTHORIZATION_CODE}' \
  --data-urlencode 'code_verifier={CODE_VERIFIER}' \
  -d 'client_id=1234567890' \
  -d 'client_secret=1234567890abcdefghij1234567890ab'
```

## Refresh access token

`POST https://api.line.me/oauth2/v2.1/token`

Body: `grant_type=refresh_token`, `refresh_token`, `client_id`, `client_secret` (as above).

Response `200`: new `access_token`, `expires_in`, `scope`, `token_type`, and the **same** `refresh_token` you sent. The refresh token is not renewed.

`400 Bad Request` when the refresh token has expired → send the user back through login.

## Verify access token

`GET https://api.line.me/oauth2/v2.1/verify?access_token={ACCESS_TOKEN}`

Response `200`: `client_id`, `scope`, `expires_in`. `400` when the token is malformed, expired, or revoked.

Verify any access token you receive from a client or another server before using it on your own servers.

## Revoke access token

`POST https://api.line.me/oauth2/v2.1/revoke`

Body: `access_token`, `client_id`, `client_secret`.

Response: `204 No Content`, empty body.

Use it when the user logs out, so the token cannot be used after logout.

## Deauthorize the app (user unregisters)

`POST https://api.line.me/user/v1/deauthorize`

`Authorization: Bearer {channel access token}` — a channel access token, not the LINE Login user token.

Body: `userAccessToken` (the LINE Login access token you hold for that user).

Response: `200`, empty body.

LINE requires this when a user unregisters from your app or terminates the link between your app and the LINE app: the permissions the user granted must be deauthorized on their behalf, and the app must state in its terms what happens on unregistration.

## Lifecycle rules

1. Access token expired → refresh with the refresh token.
2. Refresh token expired (90 days) → re-prompt the user to log in. Never loop on refresh.
3. User revoked consent ("Unlink") → both tokens are dead. Do not refresh. Force re-login.
4. User unregistered → revoke **and** deauthorize, then delete the user's data from your app.

---

Source: [Managing access tokens](https://developers.line.biz/en/docs/line-login/managing-access-tokens/) · [LINE Login v2.1 API reference](https://developers.line.biz/en/reference/line-login/) · [LINE Login development guidelines](https://developers.line.biz/en/docs/line-login/development-guidelines/) · verified 2026-11-20
