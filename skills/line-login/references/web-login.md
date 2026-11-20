# LINE Login — web login flow

The web flow is OAuth 2.0 authorization code grant + OpenID Connect, with PKCE (see `pkce.md`).

## 1. Authorization request

`GET https://access.line.me/oauth2/v2.1/authorize`

| parameter | required | notes |
|---|---|---|
| `response_type` | yes | `code` only. Anything else → callback error `UNSUPPORTED_RESPONSE_TYPE`. |
| `client_id` | yes | LINE Login channel ID. |
| `redirect_uri` | yes | URL-encoded. Must be registered as a callback URL on the channel. Query parameters are allowed. |
| `state` | yes | Alphanumeric string, **not** URL-encoded. Generate a random value per login session; verify it on the callback. |
| `scope` | yes | Space-separated, URL-encoded as `%20`. See `users-and-consent.md`. |
| `nonce` | no | Anti-replay value, echoed inside the ID token. Include it when you request `openid`. |
| `ui_locales` | no | BCP 47 language tags for the LINE Login screen, in order of preference. |
| `code_challenge` | no | PKCE. Base64URL(SHA-256(code_verifier)). |
| `code_challenge_method` | no | `S256` only. `plain` is not supported. |
| `disable_auto_login` | no | `true` disables the LINE app's auto login. |

Example:

```
https://access.line.me/oauth2/v2.1/authorize
  ?response_type=code
  &client_id=1234567890
  &redirect_uri=https%3A%2F%2Fexample.com%2Fauth%3Fkey%3Dvalue
  &state=12345abcde
  &scope=profile%20openid
  &nonce=09876xyz
```

## 2. Callback

Success — the platform redirects to the registered callback URL:

```
https://example.com/callback?code=abcd1234&state=0987poi
```

| parameter | notes |
|---|---|
| `code` | Authorization code. Exchange it once, immediately, server-side. |
| `state` | Echo of the value you sent. Compare against the value stored for this session. |

Failure — the user declined, or the request was malformed:

```
https://example.com/callback?error=ACCESS_DENIED&error_description=...&state=0987poi
```

| `error` | meaning | app behavior |
|---|---|---|
| `ACCESS_DENIED` | User declined the permission grant, or the request failed | Show a retry. Not an error state to escalate. |
| `UNSUPPORTED_RESPONSE_TYPE` | `response_type` was not `code` | Bug in your app. |
| `INVALID_SCOPE` | Scope value is not valid | Bug in your app. |
| `SERVER_ERROR` | Unexpected error on the LINE Platform | Retry later. |

`state` is optional in the error response — use it only to identify which login session failed.

## 3. `state` mismatch: CSRF or auto login failure?

When the `state` on the callback does not match the value stored for the session, LINE cannot tell you the cause. Two causes are indistinguishable:

- A third party tampered with the request (CSRF).
- **Auto login failed** — for example the user is in private browsing, or the request came from an in-app browser where Universal Links / App Links do not work. The platform still redirects to the callback, but with an invalid `code` and a mismatched `state`.

LINE states it is impossible to determine which one happened. So:

- Treat the mismatch as a failed login: show an error and let the user retry.
- Do not tell the user "possible attack".
- Do not silently re-issue the login without user interaction.

The auto login cookie lives under the `access.line.me` domain. While it is valid, the SSO screen is shown for login in the same browser.

To force a manual login, add `disable_auto_login=true` to the authorization URL. Auto login takes precedence over SSO login when both are enabled.

## 4. Login modes

| mode | behavior |
|---|---|
| Auto login | Login completes without user operation; no LINE Login screen and no confirmation screen. |
| SSO login | Login completes on the LINE Platform with an existing session; the confirmation screen is still shown. |
| Email login | The user enters email and password on the LINE Login screen. |
| QR code login | The user scans a QR code with the LINE app. |

## 5. Consent screen

The user grants scopes on the consent screen. The consent screen is shown **again** when:

- The requested scope includes a permission that was not granted last time.
- The user revoked consent for the app ("Unlink").
- The scope includes `email`, and either a certain period has passed since the last consent or the user's email address changed.

Before requesting `email`, you must submit an application for access to user email addresses — otherwise the permission is never granted. See `users-and-consent.md`.

## 6. After the callback

1. Compare `state` with the session value → reject on mismatch (section 3).
2. Exchange `code` for tokens: `POST https://api.line.me/oauth2/v2.1/token` — see `tokens.md`.
3. Verify the ID token (if `openid` was requested) — see `id-token.md`.
4. Create the application session. Tokens never go to the browser.

## 7. LIFF

Inside a LIFF app, do not use the raw authorization URL — use `liff.login()`. See `liff.md`.

## 8. Payload tolerance

LINE states that response JSON and ID token payloads may gain, lose, or reorder properties, and whitespace may change. Parse defensively; never require a field that is not documented as guaranteed.

---

Source: [Integrating LINE Login with your web app](https://developers.line.biz/en/docs/line-login/integrate-line-login/) · [Handling auto login failure](https://developers.line.biz/en/docs/line-login/how-to-handle-auto-login-failure/) · verified 2026-11-20
