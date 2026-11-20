# line-login

Agent guidance for integrating LINE Login (v2.1) into a web app: OAuth 2.0 authorization code flow with OpenID Connect, PKCE, access/refresh/ID token lifecycle, scopes and consent, and LIFF handoff.

## What's here

```
line-login-skill/
├── PLAN.md                 # Build plan for the skill
├── GLOSSARY.md             # Canonical terms (Channel ID, State, Code Challenge, …)
├── SOURCES.md              # Source URL → what it feeds → verified date
├── LICENSE                 # MIT
├── README.md               # This file
├── skills.sh.json          # skills.sh registry
├── docs/adr/               # Decisions: doc mirroring, zero-dep scripts, scope
└── skills/
    └── line-login/
        ├── SKILL.md        # Agent entry point
        ├── references/     # 9 condensed reference files
        ├── scripts/
        │   ├── line-login.mjs          # CLI: sessions, token exchange, verification
        │   ├── line-login.test.mjs
        │   ├── check-sources.mjs       # re-fetch every source, detect drift
        │   └── sync-nextjs-example.mjs # regenerate the example reference
        └── examples/nextjs/  # runnable Next.js example + tests
```

## Development

```sh
node --test skills/line-login/                             # 36 tests, offline
node skills/line-login/scripts/check-sources.mjs           # source drift check
node skills/line-login/scripts/sync-nextjs-example.mjs     # regenerate the example reference
```

## Usage

```sh
node skills/line-login/scripts/line-login.mjs new-session \
  --client-id "$LINE_CHANNEL_ID" --redirect-uri "https://example.com/api/line/callback" --scope "profile openid"
```

## Activation

Activate when adding LINE Login to an app, implementing the authorization callback, wiring PKCE, handling scopes and consent, or debugging LINE Login token, `state`, or consent-revocation errors. See `PLAN.md` for scope, reference inventory, CLI contract, and the acceptance checklist.

## Trademarks

LINE is a trademark of LY Corporation. This project is not affiliated with, endorsed by, or sponsored by LY Corporation. References to LINE, LINE Login, and the LINE Developers Console are for descriptive purposes only.

## Sources

LINE Developers Documentation — LINE Login:

- [Integrating LINE Login with your web app](https://developers.line.biz/en/docs/line-login/integrate-line-login/)
- [Handling auto login failure](https://developers.line.biz/en/docs/line-login/how-to-handle-auto-login-failure/)
- [Implement PKCE for LINE Login](https://developers.line.biz/en/docs/line-login/integrate-pkce/)
- [Development guidelines](https://developers.line.biz/en/docs/line-login/development-guidelines/)
- [LINE Login v2.1 API reference](https://developers.line.biz/en/reference/line-login/)
- [Status codes](https://developers.line.biz/en/reference/line-login/#status-codes)
- [Managing access tokens](https://developers.line.biz/en/docs/line-login/managing-access-tokens/)
- [Get profile information from ID tokens](https://developers.line.biz/en/docs/line-login/verify-id-token/)
- [Managing users](https://developers.line.biz/en/docs/line-login/managing-users/)
- [Managing authorized apps](https://developers.line.biz/en/docs/line-login/managing-authorized-apps/)
