# Scope excludes native apps, bot linking, login-button design, and LINE URL schemes

The skill covers web app LINE Login (v2.1) plus a short LIFF handoff boundary. It deliberately does not cover native app / LINE SDK login, bot linking via `bot_prompt`, LINE Login button design specs, or LINE URL scheme deep links.

Each of those was in the source document set, but each has a different home: LINE directs native app developers to the LINE SDK rather than the raw web flow, bot linking belongs to a Messaging API / Official Account concern, button design is UI guidance rather than protocol, and LINE URL schemes are a Messaging API feature. Covering them would make the skill longer and, worse, would let an agent apply web-app rules to a LIFF or native app.

## Consequences

- `SKILL.md` states the exclusions explicitly so an agent stops and asks instead of improvising.
- LIFF is included only as a boundary: `liff.login()` instead of a raw authorize URL, `ES256` ID tokens, server-side re-verification, access token revoked when the LIFF app closes.
- If a future version adds bot linking, it should be a separate skill rather than a section here.
