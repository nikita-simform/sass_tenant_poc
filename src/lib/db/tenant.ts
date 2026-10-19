import { LRUCache } from "lru-cache";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient as TenantPrismaClient } from "@/generated/tenant-client";
import { requireEnv } from "@/lib/env";
import { stripSchemaParam } from "./connectionString";

// Bounds total Postgres connections this process can open across all tenants
// (MAX_CACHED_TENANT_CLIENTS * POOL_SIZE_PER_TENANT). Fine for a POC's handful
// of orgs; a real deployment would need a smarter eviction/connection budget.
const MAX_CACHED_TENANT_CLIENTS = 50;
const POOL_SIZE_PER_TENANT = 3;

const globalForTenantCache = globalThis as unknown as {
  tenantClientCache?: LRUCache<string, TenantPrismaClient>;
};

const cache =
  globalForTenantCache.tenantClientCache ??
  new LRUCache<string, TenantPrismaClient>({
    max: MAX_CACHED_TENANT_CLIENTS,
    dispose: (client) => {
      void client.$disconnect();
    },
  });

if (process.env.NODE_ENV !== "production") {
  globalForTenantCache.tenantClientCache = cache;
}

// schemaName must always come from Organization.schemaName (server-generated
// at onboarding, see lib/services/onboarding.ts) — never from client input.
export function getTenantClient(schemaName: string): TenantPrismaClient {
  const cached = cache.get(schemaName);
  if (cached) return cached;

  const adapter = new PrismaPg(
    {
      connectionString: stripSchemaParam(requireEnv("DATABASE_URL")),
      max: POOL_SIZE_PER_TENANT,
    },
    { schema: schemaName },
  );
  const client = new TenantPrismaClient({ adapter });
  cache.set(schemaName, client);
  return client;
}
