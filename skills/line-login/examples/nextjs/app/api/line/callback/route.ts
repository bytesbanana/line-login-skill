import { NextResponse } from "next/server";
import { takeLoginSession } from "../../../../../lib/line-session";
import { buildTokenRequestBody, classifyCallback } from "../../../../../lib/line-login-flow";

export async function GET(req: any) {
  const params = req.nextUrl.searchParams;
  const session = await takeLoginSession();
  const outcome = classifyCallback(params, session);

  switch (outcome.kind) {
    case "state-mismatch":
      // Could be CSRF, could be an auto login failure — do not tell the user "attack".
      return NextResponse.redirect(new URL("/login?error=login_failed", req.url), 302);
    case "declined":
      return NextResponse.redirect(new URL("/login?error=declined", req.url), 302);
    case "missing-code":
      return NextResponse.redirect(new URL("/login?error=missing_code", req.url), 302);
  }

  const res = await fetch("https://api.line.me/oauth2/v2.1/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(
      buildTokenRequestBody({
        clientId: process.env.LINE_CHANNEL_ID ?? "",
        clientSecret: process.env.LINE_CHANNEL_SECRET ?? "",
        code: outcome.code,
        redirectUri: process.env.LINE_REDIRECT_URI ?? "",
        codeVerifier: session!.codeVerifier,
      }),
    ),
  });
  if (!res.ok) {
    return NextResponse.redirect(new URL("/login?error=token_exchange_failed", req.url), 302);
  }
  const tokens = await res.json();

  // Verify the ID token server-side before trusting the user's identity:
  //   node scripts/line-login.mjs verify-id-token --offline --id-token "$ID_TOKEN" \
  //     --client-id "$LINE_CHANNEL_ID" --client-secret "$LINE_CHANNEL_SECRET" --nonce "$NONCE"
  // Then create your own session. The LINE tokens stay on the server.

  return NextResponse.redirect(new URL("/dashboard", req.url), 302);
}
