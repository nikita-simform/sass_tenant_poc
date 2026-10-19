import { afterAll, describe, expect, it } from "vitest";
import { signupSchema } from "@/lib/validation/auth";
import { parseOrThrow } from "@/lib/validation/parse";
import { ValidationError } from "@/lib/errors";
import { onboardOrganization } from "@/lib/services/onboarding";
import { cleanupOrg, createTestOrg, ensureDefaultPlans, uniqueEmail, uniqueOrgName } from "./helpers";

describe("bad input is rejected before it reaches business logic", () => {
  it("rejects a malformed email at the schema layer (no DB access needed)", () => {
    expect(() =>
      parseOrThrow(signupSchema, {
        organizationName: "Acme",
        planName: "Free",
        adminEmail: "not-an-email",
        adminPassword: "password123",
      }),
    ).toThrow(ValidationError);
  });

  it("rejects signup against a plan that does not exist", async () => {
    await ensureDefaultPlans();
    await expect(
      onboardOrganization({
        organizationName: uniqueOrgName("NoPlan"),
        planName: "DoesNotExist",
        adminEmail: uniqueEmail("no-plan"),
        adminPassword: "password123",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("organization names must be unique", () => {
  let org: Awaited<ReturnType<typeof createTestOrg>>;

  afterAll(async () => {
    if (org) {
      await cleanupOrg(org.organizationId, org.schemaName);
    }
  });

  it("rejects signup with an organization name that is already taken", async () => {
    await ensureDefaultPlans();
    const name = uniqueOrgName("Duplicate Co");
    org = await createTestOrg({ organizationName: name });

    await expect(createTestOrg({ organizationName: name })).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(createTestOrg({ organizationName: name })).rejects.toThrow(/already exists/i);
  });
});
