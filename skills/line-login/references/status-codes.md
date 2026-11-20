# Status codes, errors, and logging

## HTTP status codes (LINE Login API)

| status | meaning | what to do |
|---|---|---|
| `200 OK` | Success | — |
| `204 No Content` | Success, empty body (revoke) | — |
| `400 Bad Request` | Bad request: malformed parameters, expired access token, revoked access token, expired refresh token, invalid scope, invalid code | Inspect the error body; do not retry blindly. For an expired refresh token → re-prompt login. |
| `401 Unauthorized` | The `Authorization` header is wrong | Check the header (e.g. `Bearer {access_token}`). |
| `403 Forbidden` | Not authorized to use the API | Check the channel / account / plan. |
| `413 Payload Too Large` | Request exceeds 2 MB | Shrink the request. |
| `429 Too Many Requests` | Rate limit exceeded | Back off and retry with jitter. Thresholds are not disclosed. |
| `500 Internal Server Error` | Temporary error on the LINE Platform | Retry later with backoff. |

## Authorization error codes (callback)

| `error` | meaning | app behavior |
|---|---|---|
| `ACCESS_DENIED` | The user declined the permission grant, or the request failed | Show a retry. |
| `UNSUPPORTED_RESPONSE_TYPE` | `response_type` was not `code` | Bug in your app. |
| `INVALID_SCOPE` | Invalid `scope` value | Bug in your app. |
| `SERVER_ERROR` | Unexpected error on the LINE Platform | Retry later. |

The error response may also carry `error_description` and `state`.

## Logging

LINE recommends saving these logs for a period, so a problem can be investigated later.

**Authorization request** — time the request was made and the request parameters:

```
Mon, 16 Jul 2021 10:20:10 GMT https://access.line.me/oauth2/v2.1/authorize?response_type=code&client_id=xxxxxxxxxx...
```

**Authorization code or error response** — time received, request method, and the callback URL:

```
Mon, 16 Jul 2021 10:20:20 GMT GET /callback?code=Zfl2WjsWcn2XBBWApcty&state=<redacted>
```

**LINE Login API request** — request ID (`x-line-request-id` from the response headers), time, request method, endpoint, status code:

```
8d48c8577e739b9c Mon, 16 Jul 2021 10:20:22 GMT POST https://api.line.me/oauth2/v2.1/token 200
```

Additionally useful, depending on your app: the API request body and the response body. LINE provides no logs of its own — you own the trail.

### Redaction rules

| value | rule |
|---|---|
| `access_token`, `refresh_token`, `id_token` | Never log. |
| authorization `code`, `code_verifier` | Never log. |
| `client_secret` | Never log. |
| `state`, `nonce` | Mask. |
| Full authorize URL | Log only with credentials redacted. |

Note that the token endpoint receives the `code` in the request body, so a body log must be redacted too — that is why LINE recommends logging bodies only "depending on the requirements of the web app you're running".

## Prohibited and required matters

- **Prohibited:** mass authorization or API requests to the LINE Platform (load testing). Use a test environment that does not hammer the platform. Over the limit → `429`.
- **Required:** when a user unregisters from your app or terminates the link between your app and the LINE app, deauthorize the permissions the user granted via `POST /user/v1/deauthorize` (see `tokens.md`), and state in your terms what happens on unregistration.

---

Source: [LINE Login v2.1 API reference — status codes](https://developers.line.biz/en/reference/line-login/#status-codes) · [LINE Login development guidelines](https://developers.line.biz/en/docs/line-login/development-guidelines/) · [Handling auto login failure](https://developers.line.biz/en/docs/line-login/how-to-handle-auto-login-failure/) · verified 2026-11-20
