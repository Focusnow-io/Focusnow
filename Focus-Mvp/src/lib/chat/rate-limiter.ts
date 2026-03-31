import { prisma } from "@/lib/prisma";
import { checkTokenBudget, type TokenBudgetResult } from "@/lib/usage/token-tracker";
import { getPlanLimits } from "@/lib/usage/plan-limits";

const USER_DAILY_LIMIT = Number(process.env.CHAT_USER_DAILY_LIMIT) || 50;
const ORG_DAILY_LIMIT = Number(process.env.CHAT_ORG_DAILY_LIMIT) || 200;

interface RateLimitResult {
  allowed: boolean;
  message?: string;
  tokenBudget?: TokenBudgetResult;
}

/**
 * Check rate limits (message count + token budget) and increment message counter.
 * Returns { allowed: true } if the message is within limits,
 * or { allowed: false, message } with a user-facing error.
 */
export async function checkAndIncrementUsage(
  orgId: string,
  userId: string,
  estimatedTokens: number,
  plan: string = "free"
): Promise<RateLimitResult> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const limits = getPlanLimits(plan);
  const msgLimit = limits.dailyMessageLimit || USER_DAILY_LIMIT;
  const orgMsgLimit = msgLimit * (limits.orgDailyMultiplier || 4);

  // Check token budget (daily + weekly)
  const tokenBudget = await checkTokenBudget(orgId, userId, plan);
  if (!tokenBudget.allowed) {
    return {
      allowed: false,
      message: tokenBudget.message,
      tokenBudget,
    };
  }

  // Check user daily message limit
  const userUsage = await prisma.chatUsage.findUnique({
    where: { orgId_userId_date: { orgId, userId, date: today } },
  });

  if (userUsage && userUsage.messageCount >= msgLimit) {
    return {
      allowed: false,
      message: `You've reached your daily chat limit of ${msgLimit} messages. It resets at midnight UTC.`,
      tokenBudget,
    };
  }

  // Check org daily message limit (aggregate all users in org)
  const orgUsageAgg = await prisma.chatUsage.aggregate({
    where: { orgId, date: today },
    _sum: { messageCount: true },
  });
  const orgTotal = orgUsageAgg._sum.messageCount ?? 0;

  if (orgTotal >= orgMsgLimit) {
    return {
      allowed: false,
      message: `Your organization has reached its daily chat limit of ${orgMsgLimit} messages. It resets at midnight UTC.`,
      tokenBudget,
    };
  }

  // Increment message count
  await prisma.chatUsage.upsert({
    where: { orgId_userId_date: { orgId, userId, date: today } },
    create: {
      orgId,
      userId,
      date: today,
      messageCount: 1,
      estimatedTokensUsed: estimatedTokens,
    },
    update: {
      messageCount: { increment: 1 },
      estimatedTokensUsed: { increment: estimatedTokens },
    },
  });

  return { allowed: true, tokenBudget };
}
