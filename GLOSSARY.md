# LINE Login

Vocabulary for integrating LINE Login (v2.1) into an application. Terms are canonical for this repo; where LINE or common usage uses another word, it is listed under _Avoid_.

## Language

### Identity and consent

**Channel ID**:
The public identifier of a LINE Login channel, issued by the LINE Developers Console. Used as `client_id` and as the expected `aud` of an ID token.
_Avoid_: App ID, Client ID (as a synonym), Bot ID

**Channel Secret**:
The secret credential of a LINE Login channel, used server-side to sign ID tokens and to call the token endpoints.
_Avoid_: Client Secret (as a synonym), API key

**Provider**:
The entity that owns the relationship with the user in the LINE Login ecosystem. A user has a different User ID per provider.
_Avoid_: Tenant, Workspace

**User ID**:
The identifier of a user within one provider. Stable across consent revocation and re-consent.
_Avoid_: Member ID, Account ID

**Scope**:
A permission the user grants to the app at the consent screen — `profile`, `openid`, or `email`.
_Avoid_: Permission, Grant

**Consent Screen**:
The screen where the user grants or denies scopes to the app. Re-displayed when scopes change, when consent is revoked, or periodically for `email`.
_Avoid_: Authorization screen, Permission dialog

**Consent Revocation**:
The user withdrawing consent ("Unlink") for an authorized app, which deactivates the access and refresh tokens immediately.
_Avoid_: Unlinking, Logout

### Tokens

**Authorization Code**:
The short-lived credential delivered to the callback URL after the user authorizes the app; exchanged exactly once for tokens.
_Avoid_: Auth code, Login code

**Access Token (LINE Login)**:
A user-scoped credential, valid 30 days, proving the app may read that user's profile.
_Avoid_: Channel access token, User token, Bearer token

**Channel Access Token (Messaging API)**:
A bot-scoped credential issued for a LINE Official Account, used for the Messaging API. Not interchangeable with a LINE Login access token.
_Avoid_: Access token (when both are in play), Bot token

**Refresh Token**:
A credential, valid 90 days after the access token was issued, used to obtain a new access token without a new consent.
_Avoid_: Renewal token

**ID Token**:
A JWT issued by the LINE Platform containing the user's identity claims (`iss`, `sub`, `aud`, `exp`, `iat`, and optionally `nonce`, `name`, `picture`, `email`).
_Avoid_: Identity token, User token

### Request protection

**State**:
A random, single-use, session-bound value echoed through the authorization redirect, used to prevent cross-site request forgery.
_Avoid_: CSRF token, Session ID

**Nonce**:
A random value carried into the authorization request and echoed in the ID token, used to prevent replay of the ID token.
_Avoid_: Replay token

**Code Verifier**:
The high-entropy secret of a PKCE exchange, kept by the client until the authorization code is exchanged.
_Avoid_: PKCE secret

**Code Challenge**:
The Base64URL-encoded SHA-256 hash of a Code Verifier, sent in the authorization request. Only `S256` is supported.
_Avoid_: PKCE hash

### Login modes

**Auto Login**:
Login completed without user interaction, using a session cookie held under the LINE Platform domain. Takes precedence over SSO Login.
_Avoid_: Silent login, Passwordless login

**SSO Login**:
Login completed on the LINE Platform using an existing LINE session, still showing the consent screen.
_Avoid_: Single sign-on, Remember me

**Friendship Status**:
Whether the user has added the LINE Official Account linked to the channel as a friend.
_Avoid_: Follow state, Friend flag

### Platforms

**LIFF**:
The LINE in-app browser platform. A LIFF app logs in through `liff.login()` and receives identity through `liff.getIDToken()` or `liff.getAccessToken()`.
_Avoid_: LINE app, In-app browser

**LINE Login Channel**:
The console resource that configures a LINE Login integration — client ID, secret, callback URLs, and scope settings.
_Avoid_: Login provider, Login app
