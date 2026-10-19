import { prisma } from "@/lib/db/public";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { recordAuditEvent } from "@/lib/logging/audit";

export async function listOrgUsers(organizationId: string) {
  return prisma.user.findMany({
    where: { organizationId },
    select: { id: true, email: true, role: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
}

// Re-derives scope from the caller's own organizationId, never trusts a path
// param alone: a request naming another org's user by ID is rejected here —
// this is what stops an org admin from reaching another org's user directly.
async function getOrgScopedUserOrThrow(organizationId: string, userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.organizationId !== organizationId) {
    throw new NotFoundError("User not found");
  }
  return user;
}

export async function removeOrgUser(
  organizationId: string,
  actorUserId: string,
  targetUserId: string,
): Promise<void> {
  const target = await getOrgScopedUserOrThrow(organizationId, targetUserId);
  if (target.id === actorUserId) {
    throw new ForbiddenError("You cannot remove your own account");
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.delete({ where: { id: target.id } });
    await tx.organization.update({
      where: { id: organizationId },
      data: { userCount: { decrement: 1 } },
    });
  });

  await recordAuditEvent({
    action: "user.removed",
    organizationId,
    actorUserId,
    metadata: { removedUserId: target.id },
  });
}

export async function changeOrgUserRole(
  organizationId: string,
  actorUserId: string,
  targetUserId: string,
  role: "ORG_ADMIN" | "ORG_MEMBER",
) {
  const target = await getOrgScopedUserOrThrow(organizationId, targetUserId);

  const updated = await prisma.user.update({
    where: { id: target.id },
    data: { role },
  });

  await recordAuditEvent({
    action: "user.role_changed",
    organizationId,
    actorUserId,
    metadata: { targetUserId: target.id, newRole: role },
  });

  return updated;
}
