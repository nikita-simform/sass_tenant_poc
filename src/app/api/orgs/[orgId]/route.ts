import { NextResponse } from "next/server";
import { withAuth } from "@/lib/middleware/withAuth";
import { requireOrgAdminFor } from "@/lib/auth/authorize";
import { getOrgSummary } from "@/lib/services/orgs";

type Ctx = { params: Promise<{ orgId: string }> };

export const GET = withAuth<Ctx>(async (_request, ctx, session) => {
  const { orgId } = await ctx.params;
  requireOrgAdminFor(session, orgId);
  const summary = await getOrgSummary(session.organizationId!);
  return NextResponse.json(summary);
});
