import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/public";
import {
  assertSafeSchemaName,
  deriveSchemaName,
  listTenantMigrationFiles,
  splitGeneratedMigrationStatements,
} from "@/lib/db/tenantSchemaMigrations";
import { hashPassword } from "@/lib/auth/password";
import { ValidationError } from "@/lib/errors";
import { recordAuditEvent } from "@/lib/logging/audit";
import type { SignupInput } from "@/lib/validation/auth";

export type OnboardingResult = {
  organizationId: string;
  organizationName: string;
  schemaName: string;
  adminUserId: string;
  adminEmail: string;
};

const DUPLICATE_NAME_MESSAGE =
  "An organization with this name already exists. Please choose another name.";

// Self-service signup. Everything below runs in ONE Postgres transaction:
// CREATE SCHEMA -> replay the tenant-schema migration history into it ->
// insert Organization + admin User rows. Postgres DDL is transactional, so a
// failure at any point (including partway through the migration replay)
// rolls back the schema creation too — no orphaned schema, no dangling
// Organization row, safe to retry with the same input.
export async function onboardOrganization(input: SignupInput): Promise<OnboardingResult> {
  const plan = await prisma.plan.findUnique({ where: { name: input.planName } });
  if (!plan) {
    throw new ValidationError(`Unknown plan: ${input.planName}`);
  }

  // Fast, friendly pre-checks. Organization.name and Organization.schemaName
  // both carry a DB-level unique constraint too — that's what actually makes
  // this safe under concurrency (see the catch below), not this check alone.
  const existingOrg = await prisma.organization.findUnique({
    where: { name: input.organizationName },
  });
  if (existingOrg) {
    throw new ValidationError(DUPLICATE_NAME_MESSAGE);
  }

  const existingUser = await prisma.user.findUnique({ where: { email: input.adminEmail } });
  if (existingUser) {
    throw new ValidationError("Email is already in use");
  }

  const schemaName = deriveSchemaName(input.organizationName);
  assertSafeSchemaName(schemaName);

  const migrationFiles = listTenantMigrationFiles();
  const passwordHash = await hashPassword(input.adminPassword);

  let result: { organization: { id: string; name: string; schemaName: string }; adminUser: { id: string; email: string } };
  try {
    result = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(`CREATE SCHEMA "${schemaName}"`);
        await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schemaName}"`);

        for (const file of migrationFiles) {
          for (const statement of splitGeneratedMigrationStatements(file.sql)) {
            await tx.$executeRawUnsafe(statement);
          }
        }

        const organization = await tx.organization.create({
          data: {
            name: input.organizationName,
            schemaName,
            planId: plan.id,
            userCount: 1,
          },
        });

        const adminUser = await tx.user.create({
          data: {
            email: input.adminEmail,
            passwordHash,
            role: "ORG_ADMIN",
            organizationId: organization.id,
          },
        });

        for (const file of migrationFiles) {
          await tx.tenantMigration.create({
            data: { organizationId: organization.id, schemaName, migrationName: file.name },
          });
        }

        return { organization, adminUser };
      },
      { timeout: 15_000 },
    );
  } catch (error) {
    // Two concurrent signups can race past the pre-check above with the same
    // name, or (rarely) two different names can slugify to the same schema
    // name. Either way Postgres rejects the collision atomically — a unique
    // constraint violation, or CREATE SCHEMA's own "already exists" error —
    // and the whole transaction rolls back. Surface it as the same clear
    // message rather than a raw database error.
    if (isDuplicateOrganizationError(error)) {
      throw new ValidationError(DUPLICATE_NAME_MESSAGE);
    }
    throw error;
  }

  await recordAuditEvent({
    action: "org.onboarded",
    organizationId: result.organization.id,
    actorUserId: result.adminUser.id,
    metadata: { schemaName, planName: input.planName },
  });

  return {
    organizationId: result.organization.id,
    organizationName: result.organization.name,
    schemaName: result.organization.schemaName,
    adminUserId: result.adminUser.id,
    adminEmail: result.adminUser.email,
  };
}

function isDuplicateOrganizationError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return true;
  }
  // Raw CREATE SCHEMA failures surface as a generic driver error rather than
  // a typed Prisma error. Postgres's SQLSTATE for "duplicate_schema" is
  // 42P06 — checked defensively via `.code` since the exact wrapper shape
  // isn't part of Prisma's stable public API.
  const code = (error as { code?: unknown } | null | undefined)?.code;
  return code === "42P06";
}
