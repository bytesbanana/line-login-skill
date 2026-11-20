import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  buildAuthorizeUrl,
  codeChallenge,
  createLoginSession,
  isSessionFresh,
  type LoginSession,
} from "./line-login-flow";

const SECRET = process.env.SESSION_SECRET ?? "dev-only-secret";

function sign(value: string): string {
  return createHmac("sha256", SECRET).update(value).digest("base64url");
}

export async function startLogin(): Promise<string> {
  const session = createLoginSession();
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");

  const jar = await cookies();
  jar.set("line_login", `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });

  return buildAuthorizeUrl({
    clientId: process.env.LINE_CHANNEL_ID ?? "",
    redirectUri: process.env.LINE_REDIRECT_URI ?? "",
    scope: "profile openid",
    state: session.state,
    nonce: session.nonce,
    codeChallenge: codeChallenge(session.codeVerifier),
  });
}

export async function takeLoginSession(): Promise<LoginSession | null> {
  const jar = await cookies();
  const raw = jar.get("line_login")?.value;
  if (!raw) return null;

  const [payload, signature] = raw.split(".");
  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature ?? "");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  const session = JSON.parse(Buffer.from(payload, "base64url").toString());
  if (!isSessionFresh(session)) return null;

  jar.delete("line_login"); // single use
  return session;
}
