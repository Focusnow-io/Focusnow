import { prisma } from "@/lib/prisma";
import { getPlanLimits } from "./plan-limits";

export type Feature =
  | "chat"
  | "widget-insight"
  | "apps-chat"
  | "brain-parse"
  | "generate";

export interface TokenBudgetResult {
  allowed: boolean;
  message?: string;
  dailyUsed: number;
  dailyLimit: number;
  weeklyUsed: number;
  weeklyLimit: number;
  resetAt?: string;
}

export interface TokenRecord {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

/**
 * Pre-flight check: does the user/org have token budget remaining?
 * Checks both daily (calendar day UTC) and weekly (last 7 calendar days).
 */
export async function checkTokenBudget(
  orgId: string,
  userId: string,
  plan: string
): Promise<TokenBudgetResult> {
  const limits = getPlanLimits(plan);

  try {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const weekAgo = new Date(today);
    weekAgo.setUTCDate(weekAgo.getUTCDate() - 6); // 7 days including today

    // Fetch org overrides + usage in parallel
    const [org, userDaily, userWeekly, orgDaily, orgWeekly] = await Promise.all([
      prisma.organization.findUnique({
        where: { id: orgId },
        select: { customDailyTokenLimit: true, customWeeklyTokenLimit: true },
      }),
      // User daily
      prisma.tokenUsage.aggregate({
        where: { userId, date: today },
        _sum: { inputTokens: true, outputTokens: true },
      }),
      // User weekly (last 7 days)
      prisma.tokenUsage.aggregate({
        where: { userId, date: { gte: weekAgo, lte: today } },
        _sum: { inputTokens: true, outputTokens: true },
      }),
      // Org daily
      prisma.tokenUsage.aggregate({
        where: { orgId, date: today },
        _sum: { inputTokens: true, outputTokens: true },
      }),
      // Org weekly
      prisma.tokenUsage.aggregate({
        where: { orgId, date: { gte: weekAgo, lte: today } },
        _sum: { inputTokens: true, outputTokens: true },
      }),
    ]);

    const userDailyUsed =
      (userDaily._sum.inputTokens ?? 0) + (userDaily._sum.outputTokens ?? 0);
    const userWeeklyUsed =
      (userWeekly._sum.inputTokens ?? 0) +
      (userWeekly._sum.outputTokens ?? 0);
    const orgDailyUsed =
      (orgDaily._sum.inputTokens ?? 0) + (orgDaily._sum.outputTokens ?? 0);
    const orgWeeklyUsed =
      (orgWeekly._sum.inputTokens ?? 0) + (orgWeekly._sum.outputTokens ?? 0);

    // Per-org overrides take precedence over plan defaults
    const userDailyLimit = org?.customDailyTokenLimit ?? limits.dailyTokenLimit;
    const userWeeklyLimit = org?.customWeeklyTokenLimit ?? limits.weeklyTokenLimit;
    const orgDailyLimit = userDailyLimit * limits.orgDailyMultiplier;
    const orgWeeklyLimit = userWeeklyLimit * limits.orgWeeklyMultiplier;

    // Check user daily
    if (userDailyUsed >= userDailyLimit) {
      const resetAt = new Date(today);
      resetAt.setUTCDate(resetAt.getUTCDate() + 1);
      return {
        allowed: false,
        message: `You've reached your daily token limit. Resets at midnight UTC.`,
        dailyUsed: userDailyUsed,
        dailyLimit: userDailyLimit,
        weeklyUsed: userWeeklyUsed,
        weeklyLimit: userWeeklyLimit,
        resetAt: resetAt.toISOString(),
      };
    }

    // Check user weekly
    if (userWeeklyUsed >= userWeeklyLimit) {
      const resetAt = new Date(today);
      resetAt.setUTCDate(resetAt.getUTCDate() + (8 - resetAt.getUTCDay())); // next Monday
      return {
        allowed: false,
        message: `You've reached your weekly token limit. Resets next Monday at midnight UTC.`,
        dailyUsed: userDailyUsed,
        dailyLimit: userDailyLimit,
        weeklyUsed: userWeeklyUsed,
        weeklyLimit: userWeeklyLimit,
        resetAt: resetAt.toISOString(),
      };
    }

    // Check org daily
    if (orgDailyUsed >= orgDailyLimit) {
      const resetAt = new Date(today);
      resetAt.setUTCDate(resetAt.getUTCDate() + 1);
      return {
        allowed: false,
        message: `Your organization has reached its daily token limit. Resets at midnight UTC.`,
        dailyUsed: userDailyUsed,
        dailyLimit: userDailyLimit,
        weeklyUsed: userWeeklyUsed,
        weeklyLimit: userWeeklyLimit,
        resetAt: resetAt.toISOString(),
      };
    }

    // Check org weekly
    if (orgWeeklyUsed >= orgWeeklyLimit) {
      const resetAt = new Date(today);
      resetAt.setUTCDate(resetAt.getUTCDate() + (8 - resetAt.getUTCDay()));
      return {
        allowed: false,
        message: `Your organization has reached its weekly token limit. Resets next Monday at midnight UTC.`,
        dailyUsed: userDailyUsed,
        dailyLimit: userDailyLimit,
        weeklyUsed: userWeeklyUsed,
        weeklyLimit: userWeeklyLimit,
        resetAt: resetAt.toISOString(),
      };
    }

    return {
      allowed: true,
      dailyUsed: userDailyUsed,
      dailyLimit: userDailyLimit,
      weeklyUsed: userWeeklyUsed,
      weeklyLimit: userWeeklyLimit,
    };
  } catch (error) {
    console.error(
      "[TOKEN_BUDGET] Failed to check token budget, allowing request:",
      error
    );
    return {
      allowed: true,
      dailyUsed: 0,
      dailyLimit: limits.dailyTokenLimit,
      weeklyUsed: 0,
      weeklyLimit: limits.weeklyTokenLimit,
    };
  }
}

/**
 * Record actual token usage after a Claude API call completes.
 */
export async function recordTokenUsage(
  orgId: string,
  userId: string,
  feature: Feature,
  tokens: TokenRecord
): Promise<void> {
  try {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    await prisma.tokenUsage.upsert({
      where: {
        orgId_userId_date_feature: { orgId, userId, date: today, feature },
      },
      create: {
        orgId,
        userId,
        date: today,
        feature,
        inputTokens: tokens.inputTokens,
        outputTokens: tokens.outputTokens,
        cacheReadTokens: tokens.cacheReadTokens ?? 0,
        cacheWriteTokens: tokens.cacheWriteTokens ?? 0,
        requestCount: 1,
      },
      update: {
        inputTokens: { increment: tokens.inputTokens },
        outputTokens: { increment: tokens.outputTokens },
        cacheReadTokens: { increment: tokens.cacheReadTokens ?? 0 },
        cacheWriteTokens: { increment: tokens.cacheWriteTokens ?? 0 },
        requestCount: { increment: 1 },
      },
    });
  } catch (error) {
    console.error("[TOKEN_USAGE] Failed to record token usage:", error);
  }
}
