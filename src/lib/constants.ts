// Single source of truth for default plans — used by prisma/seed.ts (creates
// them) and the signup page (offers them), so the two can't drift apart.
export const DEFAULT_PLANS = [
  { name: "Free", maxUsers: 3, maxStorageMB: 100 },
  { name: "Pro", maxUsers: 20, maxStorageMB: 5_000 },
  { name: "Enterprise", maxUsers: 500, maxStorageMB: 100_000 },
] as const;

export const PLAN_NAMES = DEFAULT_PLANS.map((plan) => plan.name);
