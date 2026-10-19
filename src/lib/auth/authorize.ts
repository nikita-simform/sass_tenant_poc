import { ForbiddenError } from "@/lib/errors";
import type { SessionClaims } from "./jwt";

// Rejects a request whose path names a different org than the caller's own
// session — checked here, in addition to route handlers using
// session.organizationId (never the path param) for the actual query scope.
export function requireOrgAdminFor(session: SessionClaims, orgIdFromPath: string): void {
  if (session.role !== "ORG_ADMIN" || session.organizationId !== orgIdFromPath) {
    throw new ForbiddenError("You do not have admin access to this organization");
  }
}

export function requirePlatformAdmin(session: SessionClaims): void {
  if (session.role !== "PLATFORM_ADMIN") {
    throw new ForbiddenError("Platform admin access required");
  }
}
