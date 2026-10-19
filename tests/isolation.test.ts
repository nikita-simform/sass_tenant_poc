import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getTenantClient } from "@/lib/db/tenant";
import { createResource, getResourceOrThrow } from "@/lib/services/resources";
import { NotFoundError } from "@/lib/errors";
import { cleanupOrg, createTestOrg, ensureDefaultPlans } from "./helpers";

// This is the sharpest test in the POC (see README / spec §6): a well-formed
// request for a resource by ID that happens to belong to a different
// organization must not return that organization's data.
describe("cross-tenant resource isolation", () => {
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

  it("cannot read another organization's resource by ID", async () => {
    const clientB = getTenantClient(orgB.schemaName);
    const resourceB = await createResource(clientB, { name: "B's secret doc" }, orgB.adminUserId);

    const clientA = getTenantClient(orgA.schemaName);
    await expect(getResourceOrThrow(clientA, resourceB.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("can read its own resource", async () => {
    const clientA = getTenantClient(orgA.schemaName);
    const resourceA = await createResource(clientA, { name: "A's doc" }, orgA.adminUserId);
    const fetched = await getResourceOrThrow(clientA, resourceA.id);
    expect(fetched.id).toBe(resourceA.id);
  });

  it("a query written against the wrong tenant's client structurally cannot see the other org's rows", async () => {
    // Simulates a developer reaching for the wrong tenant client entirely —
    // there is no organizationId column to forget to filter by here. The
    // only way to leak data is to hold the wrong tenant's Prisma client,
    // which withTenant (lib/middleware/withTenant.ts) makes impossible from
    // an actual route handler: it always resolves the client from the
    // caller's own verified session, never from a parameter a handler could
    // pass incorrectly.
    const clientB = getTenantClient(orgB.schemaName);
    const rowsVisibleToB = await clientB.resource.findMany();
    expect(rowsVisibleToB.some((r) => r.name === "A's doc")).toBe(false);
  });
});
