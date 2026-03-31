import { NextResponse } from "next/server";
import { getSessionOrg, unauthorized } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";
import { getPlanLimits } from "@/lib/usage/plan-limits";

/**
 * GET /api/usage
 * Returns current user's token usage stats (daily + weekly) and plan limits.
 */
export async function GET() {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();

  const userId = ctx.session.user!.id!;
  const orgId = ctx.org.id;
  const plan = ctx.org.plan ?? "free";
  const limits = getPlanLimits(plan);

  // Per-org overrides take precedence over plan defaults
  const dailyLimit = ctx.org.customDailyTokenLimit ?? limits.dailyTokenLimit;
  const weeklyLimit = ctx.org.customWeeklyTokenLimit ?? limits.weeklyTokenLimit;

  try {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const weekAgo = new Date(today);
    weekAgo.setUTCDate(weekAgo.getUTCDate() - 6);

    // Fetch user daily, user weekly, and per-feature breakdown in parallel
    const [userDaily, userWeekly, byFeatureDaily, byFeatureWeekly] =
      await Promise.all([
        prisma.tokenUsage.aggregate({
          where: { userId, date: today },
          _sum: { inputTokens: true, outputTokens: true },
        }),
        prisma.tokenUsage.aggregate({
          where: { userId, date: { gte: weekAgo, lte: today } },
          _sum: { inputTokens: true, outputTokens: true },
        }),
        prisma.tokenUsage.groupBy({
          by: ["feature"],
          where: { userId, date: today },
          _sum: { inputTokens: true, outputTokens: true },
        }),
        prisma.tokenUsage.groupBy({
          by: ["feature"],
          where: { userId, date: { gte: weekAgo, lte: today } },
          _sum: { inputTokens: true, outputTokens: true },
        }),
      ]);

    const dailyUsed =
      (userDaily._sum.inputTokens ?? 0) + (userDaily._sum.outputTokens ?? 0);
    const weeklyUsed =
      (userWeekly._sum.inputTokens ?? 0) +
      (userWeekly._sum.outputTokens ?? 0);

    // Next reset times
    const dailyResetAt = new Date(today);
    dailyResetAt.setUTCDate(dailyResetAt.getUTCDate() + 1);

    const weeklyResetAt = new Date(today);
    // Next Monday
    const daysUntilMonday = (8 - weeklyResetAt.getUTCDay()) % 7 || 7;
    weeklyResetAt.setUTCDate(weeklyResetAt.getUTCDate() + daysUntilMonday);

    const featureBreakdown = (
      items: {
        feature: string;
        _sum: {
          inputTokens: number | null;
          outputTokens: number | null;
        };
      }[]
    ) =>
      Object.fromEntries(
        items.map((f) => [
          f.feature,
          (f._sum.inputTokens ?? 0) + (f._sum.outputTokens ?? 0),
        ])
      );

    return NextResponse.json({
      plan,
      daily: {
        used: dailyUsed,
        limit: dailyLimit,
        percentage: Math.min(
          100,
          Math.round((dailyUsed / dailyLimit) * 100)
        ),
        resetAt: dailyResetAt.toISOString(),
      },
      weekly: {
        used: weeklyUsed,
        limit: weeklyLimit,
        percentage: Math.min(
          100,
          Math.round((weeklyUsed / weeklyLimit) * 100)
        ),
        resetAt: weeklyResetAt.toISOString(),
      },
      byFeature: {
        daily: featureBreakdown(byFeatureDaily),
        weekly: featureBreakdown(byFeatureWeekly),
      },
    });
  } catch (error) {
    console.error("[USAGE_API] Failed to fetch token usage:", error);
    // Return zeroed usage if table doesn't exist yet
    return NextResponse.json({
      plan,
      daily: {
        used: 0,
        limit: dailyLimit,
        percentage: 0,
        resetAt: new Date().toISOString(),
      },
      weekly: {
        used: 0,
        limit: weeklyLimit,
        percentage: 0,
        resetAt: new Date().toISOString(),
      },
      byFeature: { daily: {}, weekly: {} },
    });
  }
}
