import "dotenv/config";
import { prisma } from "../src/lib/db/public";
import { hashPassword } from "../src/lib/auth/password";
import { requireEnv } from "../src/lib/env";
import { logger } from "../src/lib/logging/logger";
import { DEFAULT_PLANS } from "../src/lib/constants";

async function main(): Promise<void> {
  for (const plan of DEFAULT_PLANS) {
    await prisma.plan.upsert({
      where: { name: plan.name },
      update: { maxUsers: plan.maxUsers, maxStorageMB: plan.maxStorageMB },
      create: plan,
    });
  }
  logger.info("Seeded default plans");

  const platformAdminEmail = requireEnv("SEED_PLATFORM_ADMIN_EMAIL");
  const platformAdminPassword = requireEnv("SEED_PLATFORM_ADMIN_PASSWORD");

  const existing = await prisma.user.findUnique({ where: { email: platformAdminEmail } });
  if (!existing) {
    await prisma.user.create({
      data: {
        email: platformAdminEmail,
        passwordHash: await hashPassword(platformAdminPassword),
        role: "PLATFORM_ADMIN",
        organizationId: null,
      },
    });
    logger.info(`Created platform admin: ${platformAdminEmail}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    logger.error({ err: error }, "seed failed");
    await prisma.$disconnect();
    process.exit(1);
  });
