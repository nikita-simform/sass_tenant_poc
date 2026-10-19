import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { signSessionToken, verifySessionToken, type SessionClaims } from "./jwt";

export const SESSION_COOKIE_NAME = "session";

// Reads from the request object (not next/headers' cookies()) so this works
// identically in proxy.ts, route handlers, and in unit tests that construct a
// NextRequest directly — no ambient Next.js request context required.
export async function getSessionFromRequest(request: NextRequest): Promise<SessionClaims | null> {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function attachSessionCookie(
  response: NextResponse,
  claims: SessionClaims,
): Promise<NextResponse> {
  const token = await signSessionToken(claims);
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return response;
}

export function clearSessionCookie(response: NextResponse): NextResponse {
  // Must specify the same `path` the cookie was set with (attachSessionCookie
  // uses path: "/") — per RFC 6265, a Set-Cookie deletion only matches an
  // existing cookie if Path (and Domain) agree. Without this, `delete(name)`
  // defaults to the current request path (e.g. "/api/auth/logout"), which
  // never matches, so the original session cookie silently survives logout.
  response.cookies.delete({ name: SESSION_COOKIE_NAME, path: "/" });
  return response;
}
