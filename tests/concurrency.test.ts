import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inviteUser } from "@/lib/services/invites";
import { prisma } from "@/lib/db/public";
import { cleanupOrg, createTestOrg, ensureDefaultPlans, uniqueEmail } from "./helpers";

// The spec's other sharp requirement (§3.3): two simultaneous requests that
// would each individually fit within the remaining seat limit must not both
// succeed.
describe("plan seat limit under concurrency", () => {
  let org: Awaited<ReturnType<typeof createTestOrg>>;

  beforeAll(async () => {
    await ensureDefaultPlans();
    // Free plan allows 3 users; signup already used 1 (the admin). Fill one
    // more so exactly one seat remains before the race.
    org = await createTestOrg({ planName: "Free" });
    await inviteUser(org.organizationId, org.adminUserId, {
      email: uniqueEmail("filler"),
      role: "ORG_MEMBER",
    });
  });

  afterAll(async () => {
    await cleanupOrg(org.organizationId, org.schemaName);
  });

  it("only one of two simultaneous invites at the seat cap succeeds", async () => {
    const results = await Promise.allSettled([
      inviteUser(org.organizationId, org.adminUserId, {
        email: uniqueEmail("racer-x"),
        role: "ORG_MEMBER",
      }),
      inviteUser(org.organizationId, org.adminUserId, {
        email: uniqueEmail("racer-y"),
        role: "ORG_MEMBER",
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const organization = await prisma.organization.findUniqueOrThrow({
      where: { id: org.organizationId },
    });
    // admin + filler + exactly one of the two racers = 3, the plan's cap.
    expect(organization.userCount).toBe(3);
  });
});
