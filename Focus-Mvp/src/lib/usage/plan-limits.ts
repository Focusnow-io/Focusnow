export interface PlanLimits {
  /** Max tokens (input + output) a single user can consume per day */
  dailyTokenLimit: number;
  /** Max tokens (input + output) a single user can consume per rolling 7-day window */
  weeklyTokenLimit: number;
  /** Max messages per user per day (existing guardrail) */
  dailyMessageLimit: number;
  /** Org-level daily token limit = user daily * this multiplier */
  orgDailyMultiplier: number;
  /** Org-level weekly token limit = user weekly * this multiplier */
  orgWeeklyMultiplier: number;
}

export const PLAN_LIMITS: Record<string, PlanLimits> = {
  free: {
    dailyTokenLimit: 150_000,
    weeklyTokenLimit: 500_000,
    dailyMessageLimit: 50,
    orgDailyMultiplier: 4,
    orgWeeklyMultiplier: 4,
  },
  pilot: {
    dailyTokenLimit: 500_000,
    weeklyTokenLimit: 2_000_000,
    dailyMessageLimit: 150,
    orgDailyMultiplier: 4,
    orgWeeklyMultiplier: 4,
  },
  paid: {
    dailyTokenLimit: 2_000_000,
    weeklyTokenLimit: 10_000_000,
    dailyMessageLimit: 500,
    orgDailyMultiplier: 5,
    orgWeeklyMultiplier: 5,
  },
};

export function getPlanLimits(plan: string): PlanLimits {
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;
}
