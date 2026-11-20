# Zero-dependency Node scripts

Helper scripts are Node `.mjs` files using only built-ins (`node:crypto`, `node:fs`, `node:url`), with no npm dependencies.

The alternative — `jose` for JWT verification, `oauth4webapi` for the flow — would be less code to maintain, but it adds an install step to every consuming project and makes the skill's behavior depend on library versions. Hand-rolling the small amount of crypto we need (SHA-256 → Base64URL for PKCE, HMAC-SHA256 for `HS256` ID token verification) keeps the skill portable and auditable. If a consumer already trusts `jose`, the reference files should point at it rather than at the scripts.

## Consequences

- Scripts must not `npm install` anything; use `node:crypto` only.
- Output is a stable JSON contract (one object on stdout) so agents can parse it without reading prose.
- The scripts are an aid, not the implementation: the skill must still state the protocol steps in `SKILL.md` so the agent can implement it in the consumer's own stack.
