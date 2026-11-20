# LINE Login v2.1 API reference

Base URL: `https://api.line.me`

| endpoint | method | purpose |
|---|---|---|
| `/oauth2/v2.1/token` | POST | Issue access token (`grant_type=authorization_code`) or refresh (`grant_type=refresh_token`). |
| `/oauth2/v2.1/verify` | GET | Verify an access token. Query param `access_token`. |
| `/oauth2/v2.1/verify` | POST | Verify an ID token. Body `id_token`, `client_id`. |
| `/oauth2/v2.1/revoke` | POST | Revoke an access token. Body `access_token`, `client_id`, `client_secret`. |
| `/user/v1/deauthorize` | POST | Deauthorize the app on behalf of the user. Header `Authorization: Bearer {channel access token}`, body `userAccessToken`. |
| `/v2/profile` | GET | The user's profile. Header `Authorization: Bearer {access token}`. |

## Issue access token — `POST /oauth2/v2.1/token`

Request body:

| parameter | required | notes |
|---|---|---|
| `grant_type` | yes | `authorization_code` or `refresh_token`. |
| `code` | yes (authorization_code) | Authorization code from the callback. Single use. |
| `redirect_uri` | yes (authorization_code) | Same value as in the authorization request. |
| `code_verifier` | if PKCE | See `pkce.md`. |
| `refresh_token` | yes (refresh_token) | The refresh token to redeem. |
| `client_id` | yes | Channel ID. Required when authenticating by request body. |
| `client_secret` | depends | Required by request body for channels whose app type is only *Web app*; ignored for *Mobile app and Web app* and *Mobile app*. |

Content type: `application/x-www-form-urlencoded`.

Response `200`:

| field | notes |
|---|---|
| `access_token` | User access token, 30 days. |
| `expires_in` | Seconds until expiry. |
| `id_token` | Present only when `openid` was requested. |
| `refresh_token` | Present when refresh is possible. |
| `scope` | Granted scopes. `email` never appears here. |
| `token_type` | `Bearer`. |

## Verify access token — `GET /oauth2/v2.1/verify`

Query parameter: `access_token` (required).

Response `200`: `client_id`, `scope`, `expires_in`.

`400` when the token is malformed, expired, or has been revoked.

## Verify ID token — `POST /oauth2/v2.1/verify`

Request body: `id_token` (required), `client_id` (required).

Response `200`: `client_id`, `scope`, `expires_in`, and the user's profile information (display name, profile image, and email address when granted).

## Revoke access token — `POST /oauth2/v2.1/revoke`

Request body: `access_token` (required), `client_id`, `client_secret` (as above).

Response: `204 No Content`, empty body.

`400` when the access token is invalid for the target user — for example the user already deauthorized the app, or the token was already revoked.

## Deauthorize — `POST /user/v1/deauthorize`

Header: `Authorization: Bearer {channel access token}` (required).
Body: `userAccessToken` — the LINE Login access token of the user being deauthorized.

Response: `200`, empty body.

Also usable to revoke permissions for LIFF apps and LINE MINI Apps.

## Profile — `GET /v2/profile`

Header: `Authorization: Bearer {access token}` (requires the `profile` scope).

Response `200`: `userId`, `displayName`, `pictureUrl`, `statusMessage`, `language`.

## Common specifications

- Rate limits: thresholds are not disclosed. `429 Too Many Requests` when exceeded.
- Response header `x-line-request-id`: log it for every API call.
- Response payloads may change shape — new properties, different ordering, different whitespace. Parse defensively.
- Legacy v2.0 endpoints (`/v2/oauth/accessToken`, `/v2/oauth/verify`) are not covered here; v2.1 only.

---

Source: [LINE Login v2.1 API reference](https://developers.line.biz/en/reference/line-login/) · verified 2026-11-20
