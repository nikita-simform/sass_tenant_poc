import "dotenv/config";
import { prisma } from "../src/lib/db/public";
import { createPlatformAdmin } from "../src/lib/services/platformAdmin";
import { ValidationError } from "../src/lib/errors";
import { logger } from "../src/lib/logging/logger";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseArgs(argv: string[]): { email?: string; password?: string } {
  const result: { email?: string; password?: string } = {};
  for (const arg of argv) {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    if (key === "email" || key === "password") {
      result[key] = rest.join("=");
    }
  }
  return result;
}

async function main(): Promise<void> {
  const { email, password } = parseArgs(process.argv.slice(2));

  if (!email || !EMAIL_RE.test(email) || !password || password.length < 8) {
    console.error(
      "Usage: npm run platform-admin:create -- --email=someone@example.com --password=at-least-8-chars",
    );
    process.exitCode = 1;
    return;
  }

  const result = await createPlatformAdmin({ email, password });
  logger.info(
    result.created
      ? `Created platform admin: ${result.email}`
      : `${result.email} is already a platform admin — nothing to do.`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    if (error instanceof ValidationError) {
      console.error(error.message);
    } else {
      logger.error({ err: error }, "create-platform-admin failed");
    }
    await prisma.$disconnect();
    process.exitCode = 1;
  });
