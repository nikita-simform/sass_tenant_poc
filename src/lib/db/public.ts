import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { requireEnv } from "@/lib/env";
import { stripSchemaParam } from "./connectionString";

// Shared control-plane client: Organization, Plan, User, Invite, AuditLog,
// TenantMigration. Platform-admin code must import ONLY this client — never
// src/lib/db/tenant.ts — so there is no code path by which it could reach a
// tenant's content tables.
const globalForPrisma = globalThis as unknown as { publicPrisma?: PrismaClient };

function createPublicClient(): PrismaClient {
  const adapter = new PrismaPg(
    { connectionString: stripSchemaParam(requireEnv("DATABASE_URL")) },
    { schema: "public" },
  );
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.publicPrisma ?? createPublicClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.publicPrisma = prisma;
}
