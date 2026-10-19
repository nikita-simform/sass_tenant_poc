import { prisma } from "@/lib/db/public";
import type { PaginationQuery } from "@/lib/validation/pagination";

// Platform-admin-facing queries. This file imports ONLY lib/db/public — it
// never imports lib/db/tenant, so there is no code path here by which a
// platform admin route could reach any org's content, even by accident.
// The explicit `select` below is a second layer of the same guarantee: even
// if a relation were added later, this query only ever returns the fields
// named here.
export async function listOrganizationsForPlatformAdmin(query: PaginationQuery) {
  const [items, total] = await Promise.all([
    prisma.organization.findMany({
      select: {
        id: true,
        name: true,
        createdAt: true,
        userCount: true,
        storageUsedMB: true,
        plan: { select: { name: true, maxUsers: true, maxStorageMB: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.organization.count(),
  ]);

  return { items, total, page: query.page, pageSize: query.pageSize };
}
