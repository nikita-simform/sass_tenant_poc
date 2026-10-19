import { prisma } from "@/lib/db/public";
import { hashPassword } from "@/lib/auth/password";
import { ValidationError } from "@/lib/errors";
import { recordAuditEvent } from "@/lib/logging/audit";

export type CreatePlatformAdminInput = { email: string; password: string };
export type CreatePlatformAdminResult = { userId: string; email: string; created: boolean };

// Platform admins are not self-service, unlike org onboarding (see
// lib/services/onboarding.ts) — there is no route that calls this. It's used
// by scripts/create-platform-admin.ts (an ops tool run out of band) and by
// prisma/seed.ts to bootstrap the first one.
export async function createPlatformAdmin(
  input: CreatePlatformAdminInput,
): Promise<CreatePlatformAdminResult> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });

  if (existing) {
    if (existing.role === "PLATFORM_ADMIN") {
      return { userId: existing.id, email: existing.email, created: false };
    }
    // Refuse rather than silently promote — an existing org-scoped account
    // becoming a platform admin is a privilege escalation an operator should
    // decide explicitly, not something this call does implicitly.
    throw new ValidationError(
      `${input.email} already exists as ${existing.role} (organizationId: ${existing.organizationId}). ` +
        "Refusing to change an existing user's role — use a different email.",
    );
  }

  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash: await hashPassword(input.password),
      role: "PLATFORM_ADMIN",
      organizationId: null,
    },
  });

  await recordAuditEvent({
    action: "platform_admin.created",
    metadata: { createdUserId: user.id, email: user.email },
  });

  return { userId: user.id, email: user.email, created: true };
}
