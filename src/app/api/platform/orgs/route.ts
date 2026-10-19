import { NextResponse } from "next/server";
import { withAuth } from "@/lib/middleware/withAuth";
import { requirePlatformAdmin } from "@/lib/auth/authorize";
import { listOrganizationsForPlatformAdmin } from "@/lib/services/platform";
import { paginationQuerySchema } from "@/lib/validation/pagination";
import { parseOrThrow } from "@/lib/validation/parse";

// Deliberately does NOT use withTenant — this route has no business ever
// resolving a tenant-schema client. See lib/services/platform.ts.
export const GET = withAuth(async (request, _ctx, session) => {
  requirePlatformAdmin(session);
  const query = parseOrThrow(
    paginationQuerySchema,
    Object.fromEntries(request.nextUrl.searchParams),
  );
  const result = await listOrganizationsForPlatformAdmin(query);
  return NextResponse.json(result);
});
