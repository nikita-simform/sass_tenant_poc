import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/public";
import * as tenantSchemaMigrations from "@/lib/db/tenantSchemaMigrations";
import { ensureDefaultPlans, uniqueEmail } from "./helpers";

describe("onboarding rolls back completely on partial failure", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("leaves no organization row, no user row, and no orphaned schema when migration replay fails", async () => {
    await ensureDefaultPlans();

    const schemaCountBefore = await countOrgSchemas();

    // Force a real failure partway through the transaction, after CREATE
    // SCHEMA has already run, to prove the whole thing rolls back together
    // — not just that the happy path works.
    vi.spyOn(tenantSchemaMigrations, "listTenantMigrationFiles").mockReturnValue([
      { name: "broken_migration", sql: "THIS IS NOT VALID SQL;" },
    ]);
    const { onboardOrganization } = await import("@/lib/services/onboarding");

    const orgName = `Rollback Test ${Date.now()}`;
    const adminEmail = uniqueEmail("rollback-admin");

    await expect(
      onboardOrganization({
        organizationName: orgName,
        planName: "Free",
        adminEmail,
        adminPassword: "password123",
      }),
    ).rejects.toThrow();

    const org = await prisma.organization.findFirst({ where: { name: orgName } });
    expect(org).toBeNull();

    const user = await prisma.user.findUnique({ where: { email: adminEmail } });
    expect(user).toBeNull();

    const schemaCountAfter = await countOrgSchemas();
    expect(schemaCountAfter).toBe(schemaCountBefore);
  });
});

async function countOrgSchemas(): Promise<number> {
  const rows = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT count(*)::bigint AS count
    FROM information_schema.schemata
    WHERE substring(schema_name from 1 for 4) = 'org_'
  `;
  return Number(rows[0].count);
}
