import { describe, expect, it } from "vitest";
import { NextResponse } from "next/server";
import { attachSessionCookie, clearSessionCookie, SESSION_COOKIE_NAME } from "@/lib/auth/session";

// Regression test: clearSessionCookie originally called
// response.cookies.delete(name) with no `path`, which defaults to the
// request's own path rather than matching attachSessionCookie's `path: "/"`.
// Per RFC 6265 a cookie deletion only takes effect if Path (and Domain)
// match the original — so logout silently failed to clear the cookie while
// still returning 200 OK.
describe("session cookie set/clear", () => {
  it("clearSessionCookie's Set-Cookie shares the same Path as attachSessionCookie's, and expires it", async () => {
    const setResponse = await attachSessionCookie(NextResponse.json({ ok: true }), {
      userId: "u1",
      role: "ORG_ADMIN",
      organizationId: "o1",
      schemaName: "org_test",
    });
    const setCookieHeader = setResponse.headers.get("set-cookie");
    expect(setCookieHeader).toContain(`${SESSION_COOKIE_NAME}=`);

    const clearResponse = clearSessionCookie(NextResponse.json({ ok: true }));
    const clearCookieHeader = clearResponse.headers.get("set-cookie");

    const setPath = /Path=([^;]+)/i.exec(setCookieHeader ?? "")?.[1];
    const clearPath = /Path=([^;]+)/i.exec(clearCookieHeader ?? "")?.[1];
    expect(clearPath).toBe(setPath);
    expect(clearCookieHeader).toMatch(/Expires=Thu, 01 Jan 1970/);
  });
});
