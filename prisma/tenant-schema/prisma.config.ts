import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// CLI-only config for authoring changes to the tenant Resource model.
// `prisma migrate dev` here connects to TENANT_DATABASE_URL, which points at
// the `tenant_template` schema — the one real schema this model's structure
// is developed and reviewed against (see prisma/tenant-schema/schema.prisma).
export default defineConfig({
  schema: "schema.prisma",
  migrations: {
    path: "migrations",
  },
  datasource: {
    url: env("TENANT_DATABASE_URL"),
  },
});
