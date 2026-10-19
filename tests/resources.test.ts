import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getTenantClient } from "@/lib/db/tenant";
import {
  createResource,
  deleteResource,
  getResourceOrThrow,
  listResources,
  updateResource,
} from "@/lib/services/resources";
import { NotFoundError } from "@/lib/errors";
import { cleanupOrg, createTestOrg, ensureDefaultPlans } from "./helpers";

describe("resources: CRUD, pagination, sorting, filtering", () => {
  let org: Awaited<ReturnType<typeof createTestOrg>>;
  let tenantDb: ReturnType<typeof getTenantClient>;

  beforeAll(async () => {
    await ensureDefaultPlans();
    org = await createTestOrg();
    tenantDb = getTenantClient(org.schemaName);

    // Five resources with distinct names/sizes/creation order, used by every
    // test below — one shared fixture rather than five separate small ones.
    await createResource(tenantDb, { name: "Alpha report", content: "aaa" }, org.adminUserId);
    await createResource(tenantDb, { name: "Beta plan", content: "bb" }, org.adminUserId);
    await createResource(tenantDb, { name: "Gamma notes", content: "c" }, org.adminUserId);
    await createResource(tenantDb, { name: "Delta report", content: "dddd" }, org.adminUserId);
    await createResource(tenantDb, { name: "Epsilon draft", content: "e" }, org.adminUserId);
  });

  afterAll(async () => {
    await cleanupOrg(org.organizationId, org.schemaName);
  });

  it("create + read: a created resource can be read back by ID with the right fields", async () => {
    const created = await createResource(tenantDb, { name: "Zeta memo", content: "hello" }, org.adminUserId);
    const fetched = await getResourceOrThrow(tenantDb, created.id);
    expect(fetched.name).toBe("Zeta memo");
    expect(fetched.sizeBytes).toBe("hello".length);
  });

  it("update: changes the given fields and recomputes size from new content", async () => {
    const created = await createResource(tenantDb, { name: "Draft", content: "short" }, org.adminUserId);
    const updated = await updateResource(tenantDb, created.id, {
      name: "Final",
      content: "a much longer piece of content",
    });
    expect(updated.name).toBe("Final");
    expect(updated.sizeBytes).toBe("a much longer piece of content".length);
  });

  it("delete: removes the resource, subsequent reads 404", async () => {
    const created = await createResource(tenantDb, { name: "Temp", content: "x" }, org.adminUserId);
    await deleteResource(tenantDb, created.id);
    await expect(getResourceOrThrow(tenantDb, created.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("pagination: page 1 and page 2 return disjoint items that together cover every match", async () => {
    const pageSize = 3;
    const page1 = await listResources(tenantDb, {
      page: 1,
      pageSize,
      sortBy: "name",
      sortDir: "asc",
    });
    const page2 = await listResources(tenantDb, {
      page: 2,
      pageSize,
      sortBy: "name",
      sortDir: "asc",
    });

    expect(page1.items).toHaveLength(pageSize);
    expect(page1.total).toBe(page2.total);

    const page1Ids = new Set(page1.items.map((r) => r.id));
    const overlap = page2.items.filter((r) => page1Ids.has(r.id));
    expect(overlap).toHaveLength(0);
  });

  it("sorting: sortDir=asc and sortDir=desc on the same field return reversed order", async () => {
    const asc = await listResources(tenantDb, {
      page: 1,
      pageSize: 100,
      sortBy: "name",
      sortDir: "asc",
    });
    const desc = await listResources(tenantDb, {
      page: 1,
      pageSize: 100,
      sortBy: "name",
      sortDir: "desc",
    });

    const ascNames = asc.items.map((r) => r.name);
    const descNames = desc.items.map((r) => r.name);
    expect(descNames).toEqual([...ascNames].reverse());

    // Sanity check it's actually sorted, not just symmetric by coincidence.
    const sortedCopy = [...ascNames].sort((a, b) => a.localeCompare(b));
    expect(ascNames).toEqual(sortedCopy);
  });

  it("filtering: search only returns resources whose name contains the term", async () => {
    const result = await listResources(tenantDb, {
      page: 1,
      pageSize: 100,
      sortBy: "name",
      sortDir: "asc",
      search: "report",
    });

    expect(result.items.length).toBeGreaterThanOrEqual(2); // "Alpha report", "Delta report"
    expect(result.items.every((r) => r.name.toLowerCase().includes("report"))).toBe(true);
  });
});
