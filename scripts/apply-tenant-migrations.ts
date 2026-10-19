import "dotenv/config";
import { prisma } from "../src/lib/db/public";
import {
  assertSafeSchemaName,
  listTenantMigrationFiles,
  splitGeneratedMigrationStatements,
} from "../src/lib/db/tenantSchemaMigrations";
import { logger } from "../src/lib/logging/logger";

const TEMPLATE_SCHEMA = "tenant_template";

// `tenant_template` gets its DDL from real `prisma migrate dev` (npm run
// tenant:migrate:dev) — we only record it here for bookkeeping consistency
// with real org schemas, never re-run its SQL (that would collide with what
// Prisma's own migration engine already created there).
async function recordTemplateAsApplied(fileName: string): Promise<void> {
  await prisma.tenantMigration.create({
    data: { organizationId: null, schemaName: TEMPLATE_SCHEMA, migrationName: fileName },
  });
}

async function applyToOrgSchema(
  organizationId: string,
  schemaName: string,
  fileName: string,
  sql: string,
): Promise<void> {
  assertSafeSchemaName(schemaName);

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schemaName}"`);
    for (const statement of splitGeneratedMigrationStatements(sql)) {
      await tx.$executeRawUnsafe(statement);
    }
    await tx.tenantMigration.create({
      data: { organizationId, schemaName, migrationName: fileName },
    });
  });
}

async function alreadyApplied(schemaName: string, migrationName: string): Promise<boolean> {
  const existing = await prisma.tenantMigration.findUnique({
    where: { schemaName_migrationName: { schemaName, migrationName } },
  });
  return existing !== null;
}

async function main(): Promise<void> {
  const files = listTenantMigrationFiles();
  if (files.length === 0) {
    logger.warn(
      "No tenant-schema migrations found. Run `npm run tenant:migrate:dev -- --name init` first.",
    );
    return;
  }

  for (const file of files) {
    if (!(await alreadyApplied(TEMPLATE_SCHEMA, file.name))) {
      await recordTemplateAsApplied(file.name);
      logger.info({ migration: file.name }, `Recorded as applied to ${TEMPLATE_SCHEMA}`);
    }
  }

  const organizations = await prisma.organization.findMany({
    select: { id: true, schemaName: true },
  });

  for (const org of organizations) {
    for (const file of files) {
      if (await alreadyApplied(org.schemaName, file.name)) {
        continue;
      }
      await applyToOrgSchema(org.id, org.schemaName, file.name, file.sql);
      logger.info({ migration: file.name, schema: org.schemaName }, "Applied to tenant schema");
    }
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    logger.error({ err: error }, "apply-tenant-migrations failed");
    await prisma.$disconnect();
    process.exit(1);
  });
