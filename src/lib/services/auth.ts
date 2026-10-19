import { prisma } from "@/lib/db/public";
import { verifyPassword } from "@/lib/auth/password";
import { UnauthorizedError } from "@/lib/errors";
import type { SessionClaims } from "@/lib/auth/jwt";
import type { LoginInput } from "@/lib/validation/auth";
import { recordAuditEvent } from "@/lib/logging/audit";

// Deliberately generic message on failure (wrong email vs. wrong password
// both look identical to the caller) — this is the one place a vague error
// is the right call, to avoid confirming which emails have accounts.
export async function authenticate(input: LoginInput): Promise<SessionClaims> {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    include: { organization: { select: { schemaName: true } } },
  });

  if (!user) {
    throw new UnauthorizedError("Invalid email or password");
  }

  const passwordOk = await verifyPassword(input.password, user.passwordHash);
  if (!passwordOk) {
    throw new UnauthorizedError("Invalid email or password");
  }

  await recordAuditEvent({
    action: "user.logged_in",
    organizationId: user.organizationId,
    actorUserId: user.id,
  });

  return {
    userId: user.id,
    role: user.role,
    organizationId: user.organizationId,
    schemaName: user.organization?.schemaName ?? null,
  };
}
