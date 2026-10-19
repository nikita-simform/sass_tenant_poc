import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/public";
import { createPlatformAdmin } from "@/lib/services/platformAdmin";
import { ValidationError } from "@/lib/errors";
import { cleanupOrg, createTestOrg, ensureDefaultPlans, uniqueEmail } from "./helpers";

describe("createPlatformAdmin", () => {
  const createdEmails: string[] = [];

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
  });

  it("creates a new platform admin with no organization", async () => {
    const email = uniqueEmail("platform-admin");
    createdEmails.push(email);

    const result = await createPlatformAdmin({ email, password: "password123" });
    expect(result.created).toBe(true);

    const user = await prisma.user.findUnique({ where: { email } });
    expect(user?.role).toBe("PLATFORM_ADMIN");
    expect(user?.organizationId).toBeNull();
  });

  it("is idempotent when the platform admin already exists", async () => {
    const email = uniqueEmail("platform-admin-repeat");
    createdEmails.push(email);

    await createPlatformAdmin({ email, password: "password123" });
    const second = await createPlatformAdmin({ email, password: "password123" });
    expect(second.created).toBe(false);
  });

  it("refuses to convert an existing org-scoped user into a platform admin", async () => {
    await ensureDefaultPlans();
    const org = await createTestOrg();
    try {
      await expect(
        createPlatformAdmin({ email: org.adminEmail, password: "password123" }),
      ).rejects.toBeInstanceOf(ValidationError);

      const user = await prisma.user.findUnique({ where: { email: org.adminEmail } });
      expect(user?.role).toBe("ORG_ADMIN");
    } finally {
      await cleanupOrg(org.organizationId, org.schemaName);
    }
  });
});
