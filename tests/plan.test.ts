import { afterEach, describe, expect, it } from "vitest";
import { changeOrganizationPlan } from "@/lib/services/orgs";
import { inviteUser } from "@/lib/services/invites";
import { ValidationError } from "@/lib/errors";
import { cleanupOrg, createTestOrg, ensureDefaultPlans, uniqueEmail } from "./helpers";

describe("changeOrganizationPlan", () => {
  let org: Awaited<ReturnType<typeof createTestOrg>> | undefined;

  afterEach(async () => {
    if (org) {
      await cleanupOrg(org.organizationId, org.schemaName);
      org = undefined;
    }
  });

  it("upgrades to a plan with a higher seat limit", async () => {
    await ensureDefaultPlans();
    org = await createTestOrg({ planName: "Free" });

    const updated = await changeOrganizationPlan(org.organizationId, "Pro");
    expect(updated.plan.name).toBe("Pro");
  });

  it("lets an org that was blocked by the seat cap actually use the extra seats after upgrading", async () => {
    await ensureDefaultPlans();
    // Free plan allows 3; signup already used 1 (the admin) + fill 2 more = at cap.
    org = await createTestOrg({ planName: "Free" });
    await inviteUser(org.organizationId, org.adminUserId, {
      email: uniqueEmail("m1"),
      role: "ORG_MEMBER",
    });
    await inviteUser(org.organizationId, org.adminUserId, {
      email: uniqueEmail("m2"),
      role: "ORG_MEMBER",
    });

    await expect(
      inviteUser(org.organizationId, org.adminUserId, {
        email: uniqueEmail("blocked"),
        role: "ORG_MEMBER",
      }),
    ).rejects.toThrow(/seat limit/i);

    await changeOrganizationPlan(org.organizationId, "Pro");

    const afterUpgrade = await inviteUser(org.organizationId, org.adminUserId, {
      email: uniqueEmail("now-fits"),
      role: "ORG_MEMBER",
    });
    expect(afterUpgrade.email).toContain("now-fits");
  });

  it("refuses to downgrade below current user count", async () => {
    await ensureDefaultPlans();
    org = await createTestOrg({ planName: "Pro" });
    // Pro allows 20 users; bring it to 4 so it no longer fits Free's cap of 3.
    for (let i = 0; i < 3; i++) {
      await inviteUser(org.organizationId, org.adminUserId, {
        email: uniqueEmail(`bulk-${i}`),
        role: "ORG_MEMBER",
      });
    }

    await expect(changeOrganizationPlan(org.organizationId, "Free")).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("rejects switching to the plan the org is already on", async () => {
    await ensureDefaultPlans();
    org = await createTestOrg({ planName: "Free" });
    await expect(changeOrganizationPlan(org.organizationId, "Free")).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("rejects an unknown plan name", async () => {
    await ensureDefaultPlans();
    org = await createTestOrg({ planName: "Free" });
    await expect(
      changeOrganizationPlan(org.organizationId, "DoesNotExist"),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
