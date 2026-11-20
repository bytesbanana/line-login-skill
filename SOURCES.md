# Sources

Every reference file distils one or more of these pages. Re-verify before publishing; `scripts/check-sources.mjs` re-fetches each URL and reports HTTP status and title drift. Titles are recorded without the site's `| LINE Developers` suffix, which the checker strips before comparing.

| URL | Feeds | Title | Verified |
|---|---|---|---|
| https://developers.line.biz/en/docs/line-login/integrate-line-login/ | references/web-login.md | Integrating LINE Login with your web app | 2026-11-20 |
| https://developers.line.biz/en/docs/line-login/how-to-handle-auto-login-failure/ | references/web-login.md, references/status-codes.md | How to handle auto login failure | 2026-11-20 |
| https://developers.line.biz/en/docs/line-login/integrate-pkce/ | references/pkce.md | PKCE support for LINE Login | 2026-11-20 |
| https://developers.line.biz/en/docs/line-login/managing-access-tokens/ | references/tokens.md | Managing access tokens | 2026-11-20 |
| https://developers.line.biz/en/docs/line-login/verify-id-token/ | references/id-token.md | Get profile information from ID tokens | 2026-11-20 |
| https://developers.line.biz/en/docs/line-login/managing-users/ | references/users-and-consent.md | Managing users | 2026-11-20 |
| https://developers.line.biz/en/docs/line-login/managing-authorized-apps/ | references/users-and-consent.md | Managing authorized apps | 2026-11-20 |
| https://developers.line.biz/en/docs/line-login/development-guidelines/ | references/status-codes.md, references/tokens.md | LINE Login development guidelines | 2026-11-20 |
| https://developers.line.biz/en/reference/line-login/ | references/api-v2.1.md, references/tokens.md, references/id-token.md | LINE Login v2.1 API reference | 2026-11-20 |
| https://developers.line.biz/en/reference/line-login/#status-codes | references/status-codes.md | LINE Login v2.1 API reference | 2026-11-20 |
| https://developers.line.biz/en/docs/liff/using-user-profile/ | references/liff.md | Using user data in LIFF apps and servers | 2026-11-20 |
| https://developers.line.biz/en/docs/liff/developing-liff-apps/ | references/liff.md | Developing a LIFF app | 2026-11-20 |
| https://developers.line.biz/en/reference/liff/ | references/liff.md | LIFF API reference | 2026-11-20 |

## Out of scope sources

Consulted and deliberately not mirrored (see `docs/adr/0003-scope-excludes-native-bot-button-and-url-schemes.md`):

- https://developers.line.biz/en/docs/line-login/link-a-bot/
- https://developers.line.biz/en/docs/line-login/login-button/
- https://developers.line.biz/en/docs/line-login/using-line-url-scheme/
- https://developers.line.biz/en/reference/line-login-v2/ (v2.0 — this skill is v2.1 only)
