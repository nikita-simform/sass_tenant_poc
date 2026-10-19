import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { changeOrgUserRole, removeOrgUser } from "@/lib/services/orgUsers";
import { NotFoundError } from "@/lib/errors";
import { cleanupOrg, createTestOrg, ensureDefaultPlans } from "./helpers";

describe("org admin actions cannot reach another organization's user", () => {
  let orgA: Awaited<ReturnType<typeof createTestOrg>>;
  let orgB: Awaited<ReturnType<typeof createTestOrg>>;

  beforeAll(async () => {
    await ensureDefaultPlans();
    orgA = await createTestOrg();
    orgB = await createTestOrg();
  });

  afterAll(async () => {
    await cleanupOrg(orgA.organizationId, orgA.schemaName);
    await cleanupOrg(orgB.organizationId, orgB.schemaName);
  });

  it("org A's admin cannot remove org B's admin by ID", async () => {
    await expect(
      removeOrgUser(orgA.organizationId, orgA.adminUserId, orgB.adminUserId),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("org A's admin cannot change org B's admin's role by ID", async () => {
    await expect(
      changeOrgUserRole(orgA.organizationId, orgA.adminUserId, orgB.adminUserId, "ORG_MEMBER"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
