import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Used by CLI commands (migrate, studio, ...) against the control-plane schema.
// Runtime queries never read this — the app constructs its own driver adapter
// per connection (see src/lib/db/public.ts and src/lib/db/tenant.ts).
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
