import { NextResponse } from "next/server";
import { withAuth } from "@/lib/middleware/withAuth";
import { requireOrgAdminFor } from "@/lib/auth/authorize";
import { listOrgUsers } from "@/lib/services/orgUsers";
import { inviteUser } from "@/lib/services/invites";
import { inviteUserSchema } from "@/lib/validation/invite";
import { parseOrThrow } from "@/lib/validation/parse";

type Ctx = { params: Promise<{ orgId: string }> };

export const GET = withAuth<Ctx>(async (_request, ctx, session) => {
  const { orgId } = await ctx.params;
  requireOrgAdminFor(session, orgId);
  // Uses session.organizationId, not the path param, for the actual query —
  // requireOrgAdminFor above already rejects any mismatch, this is belt and
  // suspenders against ever trusting the path alone.
  const users = await listOrgUsers(session.organizationId!);
  return NextResponse.json({ items: users });
});

export const POST = withAuth<Ctx>(async (request, ctx, session) => {
  const { orgId } = await ctx.params;
  requireOrgAdminFor(session, orgId);
  const body = parseOrThrow(inviteUserSchema, await request.json());
  const result = await inviteUser(session.organizationId!, session.userId, body);
  return NextResponse.json(result, { status: 201 });
});
