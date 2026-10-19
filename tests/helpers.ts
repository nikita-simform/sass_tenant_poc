import { prisma } from "@/lib/db/public";
import { onboardOrganization } from "@/lib/services/onboarding";
import { DEFAULT_PLANS } from "@/lib/constants";
import type { SignupInput } from "@/lib/validation/auth";

let counter = 0;
export function uniqueEmail(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}@test.local`;
}

export function uniqueOrgName(prefix = "Test Org"): string {
  counter += 1;
  return `${prefix} ${Date.now()}-${counter}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function ensureDefaultPlans(): Promise<void> {
  for (const plan of DEFAULT_PLANS) {
    await prisma.plan.upsert({
      where: { name: plan.name },
      update: {},
      create: plan,
    });
  }
}

export async function createTestOrg(overrides: Partial<SignupInput> = {}) {
  const input: SignupInput = {
    organizationName: overrides.organizationName ?? uniqueOrgName(),
    planName: overrides.planName ?? "Free",
    adminEmail: overrides.adminEmail ?? uniqueEmail("admin"),
    adminPassword: overrides.adminPassword ?? "password123",
  };
  return onboardOrganization(input);
}

export async function cleanupOrg(organizationId: string, schemaName: string): Promise<void> {
  await prisma.tenantMigration.deleteMany({ where: { organizationId } });
  await prisma.auditLog.deleteMany({ where: { organizationId } });
  await prisma.invite.deleteMany({ where: { organizationId } });
  await prisma.user.deleteMany({ where: { organizationId } });
  await prisma.organization.delete({ where: { id: organizationId } });
  await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
}
