#!/usr/bin/env node
/**
 * sync-nextjs-example — regenerate references/nextjs-example.md from the example files.
 *
 * The reference file embeds the example files verbatim so an agent can read one file.
 * `examples/nextjs/nextjs-example.test.mjs` fails if the two ever drift apart.
 *
 *   node scripts/sync-nextjs-example.mjs
 */

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const skillRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const exampleRoot = join(skillRoot, "examples", "nextjs");
const target = join(skillRoot, "references", "nextjs-example.md");

const SECTIONS = [
  {
    file: "lib/line-login-flow.ts",
    title: "`lib/line-login-flow.ts` — framework-free logic",
    blurb:
      "Everything worth testing lives here: the authorize URL, the code challenge, the callback classification, and the token request body. No `next/*` imports, so it can be unit tested directly.",
  },
  {
    file: "lib/line-session.ts",
    title: "`lib/line-session.ts` — session cookie",
    blurb:
      "Stores `state`, `nonce` and `code_verifier` in a signed, httpOnly cookie. Single use, 10 minute TTL, signature compared with `timingSafeEqual`.",
  },
  {
    file: "app/api/line/authorize/route.ts",
    title: "`app/api/line/authorize/route.ts` — start the login",
    blurb: "Redirects the browser to the LINE Login authorize endpoint.",
  },
  {
    file: "app/api/line/callback/route.ts",
    title: "`app/api/line/callback/route.ts` — handle the callback",
    blurb:
      "Checks the state, classifies the callback, exchanges the code server-side, and redirects. The LINE tokens never reach the browser.",
  },
];

const head = `# Next.js App Router example

A worked implementation of the web flow: two route handlers plus the session helper. The same steps apply in any stack — the protocol is framework-independent.

Runnable copies live in \`skills/line-login/examples/nextjs/\`. This file embeds them verbatim.

Environment:

\`\`\`
LINE_CHANNEL_ID=1234567890
LINE_CHANNEL_SECRET=...
LINE_REDIRECT_URI=http://localhost:3000/api/line/callback
SESSION_SECRET=...
\`\`\`

`;

const tail = `## Notes

- The channel secret never leaves the server.
- Never send the LINE access token to the browser. Store it server-side, keyed by your own session.
- \`redirect_uri\` must exactly match the callback URL registered in the LINE Developers Console.
- The \`state\` cookie is single use and expires after 10 minutes.
- A \`state\` mismatch is reported as a failed login, never as an attack — see \`web-login.md\` §3.
- Cloudflare Workers: use \`crypto.subtle\` instead of \`node:crypto\` where Node APIs are unavailable; the flow is otherwise identical.

---

Source: based on the LINE Login web flow — see \`web-login.md\`, \`pkce.md\`, \`tokens.md\` · verified 2026-11-20
`;

const parts = [head];
for (const section of SECTIONS) {
  const content = (await readFile(join(exampleRoot, section.file), "utf8")).trimEnd();
  parts.push(`## ${section.title}\n\n${section.blurb}\n\n\`\`\`ts\n${content}\n\`\`\`\n\n`);
}
parts.push(tail);

await writeFile(target, parts.join("\n"), "utf8");
process.stdout.write(`Wrote ${target}\n`);
