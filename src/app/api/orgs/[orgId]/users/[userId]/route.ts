import { NextResponse } from "next/server";
import { withAuth } from "@/lib/middleware/withAuth";
import { requireOrgAdminFor } from "@/lib/auth/authorize";
import { changeOrgUserRole, removeOrgUser } from "@/lib/services/orgUsers";
import { changeUserRoleSchema } from "@/lib/validation/invite";
import { parseOrThrow } from "@/lib/validation/parse";

type Ctx = { params: Promise<{ orgId: string; userId: string }> };

export const PATCH = withAuth<Ctx>(async (request, ctx, session) => {
  const { orgId, userId } = await ctx.params;
  requireOrgAdminFor(session, orgId);
  const body = parseOrThrow(changeUserRoleSchema, await request.json());
  const user = await changeOrgUserRole(session.organizationId!, session.userId, userId, body.role);
  return NextResponse.json(user);
});

export const DELETE = withAuth<Ctx>(async (_request, ctx, session) => {
  const { orgId, userId } = await ctx.params;
  requireOrgAdminFor(session, orgId);
  await removeOrgUser(session.organizationId!, session.userId, userId);
  return new NextResponse(null, { status: 204 });
});
