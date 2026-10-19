import { describe, expect, it } from "vitest";
import { assertSafeSchemaName, deriveSchemaName } from "@/lib/db/tenantSchemaMigrations";

describe("deriveSchemaName", () => {
  it("produces a readable, safe schema name from a normal org name", () => {
    expect(deriveSchemaName("Acme Corp")).toBe("org_acme_corp");
  });

  it("strips punctuation and collapses whitespace", () => {
    expect(deriveSchemaName("Acme, Corp!! & Co.")).toBe("org_acme_corp_co");
  });

  it("strips accents", () => {
    expect(deriveSchemaName("Café Münchén")).toBe("org_cafe_munchen");
  });

  it("never produces something assertSafeSchemaName rejects, for any input", () => {
    const inputs = ["Acme Corp", "!!!", "", "   ", "日本語の会社", "a".repeat(200), "DROP TABLE"];
    for (const input of inputs) {
      expect(() => assertSafeSchemaName(deriveSchemaName(input))).not.toThrow();
    }
  });

  it("falls back to a safe default when the input has no usable characters", () => {
    expect(deriveSchemaName("!!!")).toBe("org_org");
  });

  it("truncates very long names to stay within Postgres's identifier limit", () => {
    const schemaName = deriveSchemaName("a".repeat(200));
    expect(schemaName.length).toBeLessThanOrEqual(63);
  });
});
