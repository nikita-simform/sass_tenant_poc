import type { NextRequest } from "next/server";
import type { PrismaClient as TenantPrismaClient } from "@/generated/tenant-client";
import type { SessionClaims } from "@/lib/auth/jwt";
import { getTenantClient } from "@/lib/db/tenant";
import { ForbiddenError } from "@/lib/errors";
import { withAuth } from "./withAuth";

type TenantSession = SessionClaims & { organizationId: string; schemaName: string };

type TenantHandler<Ctx> = (
  request: NextRequest,
  ctx: Ctx,
  session: TenantSession,
  tenantDb: TenantPrismaClient,
) => Promise<Response>;

// Every Resource route uses this wrapper, never the raw tenant client factory
// directly. The handler receives a Prisma client already connected to the
// caller's own organization's schema — there is no organizationId column to
// filter by and nothing for a new, careless route to forget: it structurally
// cannot see another org's rows, because its connection was never pointed at
// that schema. Platform-admin routes must never use this wrapper.
export function withTenant<Ctx>(handler: TenantHandler<Ctx>) {
  return withAuth<Ctx>(async (request, ctx, session) => {
    if (!session.organizationId || !session.schemaName) {
      throw new ForbiddenError("This action requires membership in an organization");
    }
    const tenantDb = getTenantClient(session.schemaName);
    return handler(request, ctx, session as TenantSession, tenantDb);
  });
}
