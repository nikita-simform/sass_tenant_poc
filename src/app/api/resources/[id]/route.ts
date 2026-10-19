import { NextResponse } from "next/server";
import { withTenant } from "@/lib/middleware/withTenant";
import { deleteResource, getResourceOrThrow, updateResource } from "@/lib/services/resources";
import { updateResourceSchema } from "@/lib/validation/resource";
import { parseOrThrow } from "@/lib/validation/parse";

type Ctx = { params: Promise<{ id: string }> };

// This is the route the isolation test hits directly: a well-formed request
// for a resource by ID that happens to belong to a different organization.
// getResourceOrThrow queries the CALLER's tenant-scoped client only — another
// org's row is not merely filtered out, it was never in this connection's
// schema to begin with.
export const GET = withTenant<Ctx>(async (_request, ctx, _session, tenantDb) => {
  const { id } = await ctx.params;
  const resource = await getResourceOrThrow(tenantDb, id);
  return NextResponse.json(resource);
});

export const PATCH = withTenant<Ctx>(async (request, ctx, _session, tenantDb) => {
  const { id } = await ctx.params;
  const body = parseOrThrow(updateResourceSchema, await request.json());
  const resource = await updateResource(tenantDb, id, body);
  return NextResponse.json(resource);
});

export const DELETE = withTenant<Ctx>(async (_request, ctx, _session, tenantDb) => {
  const { id } = await ctx.params;
  await deleteResource(tenantDb, id);
  return new NextResponse(null, { status: 204 });
});
