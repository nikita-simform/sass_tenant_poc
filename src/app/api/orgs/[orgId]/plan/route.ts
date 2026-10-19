import { NextResponse } from "next/server";
import { withAuth } from "@/lib/middleware/withAuth";
import { requireOrgAdminFor } from "@/lib/auth/authorize";
import { changeOrganizationPlan } from "@/lib/services/orgs";
import { changePlanSchema } from "@/lib/validation/plan";
import { parseOrThrow } from "@/lib/validation/parse";

type Ctx = { params: Promise<{ orgId: string }> };

export const PATCH = withAuth<Ctx>(async (request, ctx, session) => {
  const { orgId } = await ctx.params;
  requireOrgAdminFor(session, orgId);
  const body = parseOrThrow(changePlanSchema, await request.json());
  const summary = await changeOrganizationPlan(session.organizationId!, body.planName);
  return NextResponse.json(summary);
});
