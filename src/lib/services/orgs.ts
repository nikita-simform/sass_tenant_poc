import { prisma } from "@/lib/db/public";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { recordAuditEvent } from "@/lib/logging/audit";

export async function getOrgSummary(organizationId: string) {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      id: true,
      name: true,
      userCount: true,
      storageUsedMB: true,
      plan: { select: { name: true, maxUsers: true, maxStorageMB: true } },
    },
  });
  if (!organization) {
    throw new NotFoundError("Organization not found");
  }
  return organization;
}

export type OrgSummary = Awaited<ReturnType<typeof getOrgSummary>>;

// Upgrading or downgrading is refused if current usage wouldn't fit the
// target plan — e.g. you can't drop to a 3-seat plan while at 5 users. The
// pre-checks below give a specific reason; the UPDATE's own WHERE clause is
// the actual atomic guard against the same kind of race the seat-limit check
// in invites.ts defends against (something else — e.g. a concurrent invite —
// pushing usage past the new plan's limits between the check and the write).
export async function changeOrganizationPlan(
  organizationId: string,
  planName: string,
): Promise<OrgSummary> {
  const plan = await prisma.plan.findUnique({ where: { name: planName } });
  if (!plan) {
    throw new ValidationError(`Unknown plan: ${planName}`);
  }

  const before = await prisma.organization.findUnique({ where: { id: organizationId } });
  if (!before) {
    throw new NotFoundError("Organization not found");
  }
  if (before.planId === plan.id) {
    throw new ValidationError(`This organization is already on the ${planName} plan`);
  }
  if (before.userCount > plan.maxUsers) {
    throw new ValidationError(
      `Cannot switch to ${planName}: it allows ${plan.maxUsers} users, but this organization currently has ${before.userCount}. Remove users first.`,
    );
  }
  if (before.storageUsedMB > plan.maxStorageMB) {
    throw new ValidationError(
      `Cannot switch to ${planName}: it allows ${plan.maxStorageMB} MB of storage, but this organization is currently using ${before.storageUsedMB} MB.`,
    );
  }

  const updated = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE "Organization" AS o
    SET "planId" = ${plan.id}
    WHERE o.id = ${organizationId}
      AND o."userCount" <= ${plan.maxUsers}
      AND o."storageUsedMB" <= ${plan.maxStorageMB}
    RETURNING o.id
  `;

  if (updated.length === 0) {
    throw new ValidationError(
      `Could not switch to ${planName} — usage changed just now and no longer fits that plan's limits. Please try again.`,
    );
  }

  await recordAuditEvent({
    action: "org.plan_changed",
    organizationId,
    metadata: { fromPlanId: before.planId, toPlanName: planName },
  });

  return getOrgSummary(organizationId);
}
