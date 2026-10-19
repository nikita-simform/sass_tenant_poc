import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/public";
import { logger } from "./logger";

export type AuditEvent = {
  action: string;
  organizationId?: string | null;
  actorUserId?: string | null;
  metadata?: Record<string, unknown>;
};

// Every onboarding event, limit rejection, and cross-tenant access attempt
// goes through here — this is what a "detect a tenant leak in production"
// scan (see README) would query against, and what the walkthrough points to
// when asked to show a structured trace rather than just a postmortem.
export async function recordAuditEvent(event: AuditEvent): Promise<void> {
  logger.info(
    {
      event: event.action,
      organizationId: event.organizationId ?? null,
      actorUserId: event.actorUserId ?? null,
      metadata: event.metadata,
    },
    event.action,
  );

  await prisma.auditLog.create({
    data: {
      action: event.action,
      organizationId: event.organizationId ?? null,
      actorUserId: event.actorUserId ?? null,
      metadata: (event.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}
