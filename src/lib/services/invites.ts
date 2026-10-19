import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db/public";
import { hashPassword } from "@/lib/auth/password";
import { LimitExceededError, ValidationError } from "@/lib/errors";
import { recordAuditEvent } from "@/lib/logging/audit";
import type { InviteUserInput } from "@/lib/validation/invite";

export type InviteResult = {
  userId: string;
  email: string;
  role: "ORG_ADMIN" | "ORG_MEMBER";
  // No email delivery in this POC — the org admin shares this with the
  // invited person out of band. A real product would send a signup-link
  // email instead of minting a password server-side.
  temporaryPassword: string;
};

function generateTemporaryPassword(): string {
  return randomBytes(9).toString("base64url");
}

export async function inviteUser(
  organizationId: string,
  invitedByUserId: string,
  input: InviteUserInput,
): Promise<InviteResult> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new ValidationError("Email is already in use");
  }

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  const user = await prisma.$transaction(async (tx) => {
    // Atomic seat reservation: this UPDATE's WHERE clause is evaluated
    // against the row's current value while it holds that row's lock, so two
    // concurrent invites against the same org serialize on it — the loser
    // sees 0 rows affected, even under Postgres's default READ COMMITTED
    // isolation. A separate "SELECT count(*) then INSERT if under limit"
    // would NOT be safe here: both transactions could read the same count
    // before either commits.
    const updated = await tx.$queryRaw<{ id: string }[]>`
      UPDATE "Organization" AS o
      SET "userCount" = o."userCount" + 1
      FROM "Plan" AS p
      WHERE o.id = ${organizationId}
        AND p.id = o."planId"
        AND o."userCount" < p."maxUsers"
      RETURNING o.id
    `;

    if (updated.length === 0) {
      throw new LimitExceededError(
        "This organization has reached its plan's seat limit. Upgrade the plan or remove a user before inviting another.",
      );
    }

    const createdUser = await tx.user.create({
      data: {
        email: input.email,
        passwordHash,
        role: input.role,
        organizationId,
      },
    });

    await tx.invite.create({
      data: {
        organizationId,
        email: input.email,
        role: input.role,
        invitedByUserId,
      },
    });

    return createdUser;
  });

  await recordAuditEvent({
    action: "user.invited",
    organizationId,
    actorUserId: invitedByUserId,
    metadata: { invitedUserId: user.id, role: input.role },
  });

  return {
    userId: user.id,
    email: user.email,
    role: user.role as "ORG_ADMIN" | "ORG_MEMBER",
    temporaryPassword,
  };
}
