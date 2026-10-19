import { NextResponse } from "next/server";
import { withTenant } from "@/lib/middleware/withTenant";
import { createResource, listResources } from "@/lib/services/resources";
import { createResourceSchema, listResourceQuerySchema } from "@/lib/validation/resource";
import { parseOrThrow } from "@/lib/validation/parse";

export const GET = withTenant(async (request, _ctx, _session, tenantDb) => {
  const query = parseOrThrow(
    listResourceQuerySchema,
    Object.fromEntries(request.nextUrl.searchParams),
  );
  const result = await listResources(tenantDb, query);
  return NextResponse.json(result);
});

export const POST = withTenant(async (request, _ctx, session, tenantDb) => {
  const body = parseOrThrow(createResourceSchema, await request.json());
  const resource = await createResource(tenantDb, body, session.userId);
  return NextResponse.json(resource, { status: 201 });
});
