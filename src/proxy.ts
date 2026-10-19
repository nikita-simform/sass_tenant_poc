import { NextResponse, type NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";

// Page-level navigation guard only. API routes enforce their own auth via
// withAuth/withTenant regardless of this file — this exists so an
// unauthenticated visitor lands on /login instead of a blank/broken page.
const PUBLIC_PATHS = ["/login", "/signup"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublicPath = PUBLIC_PATHS.some((path) => pathname.startsWith(path));

  const session = await getSessionFromRequest(request);

  if (!session && !isPublicPath) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (session && (isPublicPath || pathname === "/")) {
    const home = session.role === "PLATFORM_ADMIN" ? "/platform" : "/dashboard";
    return NextResponse.redirect(new URL(home, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
