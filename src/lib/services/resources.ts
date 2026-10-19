import type { PrismaClient as TenantPrismaClient } from "@/generated/tenant-client";
import { NotFoundError } from "@/lib/errors";
import type {
  CreateResourceInput,
  ListResourceQuery,
  UpdateResourceInput,
} from "@/lib/validation/resource";

// Every function here takes an already tenant-scoped `tenantDb` (from
// withTenant, see lib/middleware/withTenant.ts) — there is no organizationId
// parameter anywhere in this file, because there is nothing to filter by:
// the connection itself only sees this one org's Resource table.

export async function listResources(tenantDb: TenantPrismaClient, query: ListResourceQuery) {
  const where = query.search
    ? { name: { contains: query.search, mode: "insensitive" as const } }
    : {};

  const [items, total] = await Promise.all([
    tenantDb.resource.findMany({
      where,
      orderBy: { [query.sortBy]: query.sortDir },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    tenantDb.resource.count({ where }),
  ]);

  return { items, total, page: query.page, pageSize: query.pageSize };
}

export async function createResource(
  tenantDb: TenantPrismaClient,
  input: CreateResourceInput,
  createdByUserId: string,
) {
  return tenantDb.resource.create({
    data: {
      name: input.name,
      content: input.content,
      sizeBytes: input.content?.length ?? 0,
      createdByUserId,
    },
  });
}

// This is the function the isolation test (tests/isolation.test.ts) exercises
// directly: calling it with org A's tenantDb and org B's resource id returns
// NotFoundError, not org B's data — org B's row was never reachable through
// this connection in the first place.
export async function getResourceOrThrow(tenantDb: TenantPrismaClient, id: string) {
  const resource = await tenantDb.resource.findUnique({ where: { id } });
  if (!resource) {
    throw new NotFoundError("Resource not found");
  }
  return resource;
}

export async function updateResource(
  tenantDb: TenantPrismaClient,
  id: string,
  input: UpdateResourceInput,
) {
  await getResourceOrThrow(tenantDb, id);
  return tenantDb.resource.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.content !== undefined
        ? { content: input.content, sizeBytes: input.content.length }
        : {}),
    },
  });
}

export async function deleteResource(tenantDb: TenantPrismaClient, id: string): Promise<void> {
  await getResourceOrThrow(tenantDb, id);
  await tenantDb.resource.delete({ where: { id } });
}
