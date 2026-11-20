# Scopes, users, and consent

## Scopes

| scope | grants |
|---|---|
| `profile` | User ID, display name, profile image, status message. |
| `openid` | The ID token. |
| `email` | The user's email address. |

Request them space-separated in the `scope` parameter, URL-encoded as `%20`:

```
scope=profile%20openid%20email
```

- `profile` and `openid` are shown as required permissions on the consent screen.
- **`email` needs a separate application.** You must submit an application requesting access to users' email addresses before you can ask for the `email` scope. Without approval the permission is never granted, and asking for it is pointless.
- The `email` scope is **never** echoed in the `scope` field of a token response, even when it was granted. Check the ID token's `email` claim instead.
- The `scope` field of a token response lists the permissions granted to the access token.

## Getting the user's profile

```sh
curl -v -X GET https://api.line.me/v2/profile \
  -H 'Authorization: Bearer {ACCESS_TOKEN}'
```

Requires an access token with the `profile` scope. Response fields include `userId`, `displayName`, `pictureUrl`, `statusMessage`, `language`.

To get the profile *and* the email address, verify the ID token instead — see `id-token.md`.

## User ID

- The user ID is **unique per provider**. The same LINE account has a different user ID for each provider that owns it.
- The user ID does not change if the user revokes consent and consents again.
- Key your accounts on `userId` *scoped to your provider* — never on a LINE ID or an email address.

## Consent and its withdrawal

Users consent on the consent screen, can review the terms of consent, and can revoke consent at any time from the LINE app: **Settings → Account → Authorized apps → Unlink**.

When consent is revoked:

| target | effect |
|---|---|
| User | Using LINE Login for the app shows the consent screen again; LINE Login is blocked until consent is given again. |
| Provider | User ID and profile cannot be obtained, even with an access token already held. The access token cannot be updated because no refresh token is available. |

Handling:

- If the access token expired → refresh it.
- If the user revoked consent → neither token is available. Force a fresh login. Do not retry the refresh.
- Respect the decision: re-acquire the user's information only after verifying the access token.

## Logout

When a user logs out of your app, revoke their access token and delete all their data in your app:

```sh
curl -v -X POST https://api.line.me/oauth2/v2.1/revoke \
  -d "client_id={CHANNEL_ID}" -d "client_secret={CHANNEL_SECRET}" -d "access_token={ACCESS_TOKEN}"
```

If the user *unregisters* from your app, also deauthorize the app on their behalf (`POST https://api.line.me/user/v1/deauthorize`) — see `tokens.md`.

## Data handling

Handle user data according to the LINE User Data Policy. Failure to comply can result in service discontinuation.

---

Source: [Managing users](https://developers.line.biz/en/docs/line-login/managing-users/) · [Managing authorized apps](https://developers.line.biz/en/docs/line-login/managing-authorized-apps/) · verified 2026-11-20
