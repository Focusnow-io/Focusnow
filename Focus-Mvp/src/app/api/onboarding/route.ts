export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSessionOrg, unauthorized } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";

export type OnboardingStage = "import" | "capture" | "aha" | "complete";

export interface OnboardingResponse {
  stage: OnboardingStage;
  completed: boolean;
  firstRule: {
    id: string;
    name: string;
    category: string;
    entity: string;
    condition: Record<string, unknown>;
  } | null;
  hasData: boolean;
  hasActiveRule: boolean;
  hasChatAfterRule: boolean;
  suggestedQuestions: string[];
}

/**
 * GET /api/onboarding
 * Returns current onboarding stage and relevant data for nudges.
 */
export async function GET() {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();

  const { org, session } = ctx;
  const orgId = org.id;
  const userId = session.user!.id!;

  // Check if onboarding is already complete
  if (org.onboardingCompletedAt) {
    return NextResponse.json({
      stage: "complete",
      completed: true,
      firstRule: null,
      hasData: true,
      hasActiveRule: true,
      hasChatAfterRule: true,
      suggestedQuestions: [],
    } satisfies OnboardingResponse);
  }

  // Check data state
  const [productCount, supplierCount, inventoryCount, orderCount] =
    await Promise.all([
      prisma.product.count({ where: { organizationId: orgId } }),
      prisma.supplier.count({ where: { organizationId: orgId } }),
      prisma.inventoryItem.count({ where: { organizationId: orgId } }),
      prisma.order.count({ where: { organizationId: orgId } }),
    ]);

  const hasData =
    productCount > 0 ||
    supplierCount > 0 ||
    inventoryCount > 0 ||
    orderCount > 0;

  if (!hasData) {
    return NextResponse.json({
      stage: "import",
      completed: false,
      firstRule: null,
      hasData: false,
      hasActiveRule: false,
      hasChatAfterRule: false,
      suggestedQuestions: [],
    } satisfies OnboardingResponse);
  }

  // Check for active rules
  const firstRule = await prisma.brainRule.findFirst({
    where: { organizationId: orgId, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      category: true,
      entity: true,
      condition: true,
    },
  });

  if (!firstRule) {
    return NextResponse.json({
      stage: "capture",
      completed: false,
      firstRule: null,
      hasData: true,
      hasActiveRule: false,
      hasChatAfterRule: false,
      suggestedQuestions: [],
    } satisfies OnboardingResponse);
  }

  // Check if user has chatted after having a rule
  const conversation = await prisma.conversation.findFirst({
    where: { orgId, userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      messages: {
        where: { role: "USER" },
        take: 1,
        orderBy: { createdAt: "desc" },
      },
    },
  });

  const hasChatAfterRule =
    conversation !== null && conversation.messages.length > 0;

  if (hasChatAfterRule) {
    // Mark onboarding as complete
    await prisma.organization.update({
      where: { id: orgId },
      data: { onboardingCompletedAt: new Date() },
    });

    return NextResponse.json({
      stage: "complete",
      completed: true,
      firstRule: {
        ...firstRule,
        condition: firstRule.condition as Record<string, unknown>,
      },
      hasData: true,
      hasActiveRule: true,
      hasChatAfterRule: true,
      suggestedQuestions: [],
    } satisfies OnboardingResponse);
  }

  // Generate suggested questions from the first rule
  const suggestedQuestions = generateSuggestedQuestions(
    firstRule.category,
    firstRule.entity,
    firstRule.condition as Record<string, unknown>
  );

  return NextResponse.json({
    stage: "aha",
    completed: false,
    firstRule: {
      ...firstRule,
      condition: firstRule.condition as Record<string, unknown>,
    },
    hasData: true,
    hasActiveRule: true,
    hasChatAfterRule: false,
    suggestedQuestions,
  } satisfies OnboardingResponse);
}

/**
 * Generate 2 suggested questions based on the user's first rule.
 * These are shown as clickable chips in AI Chat.
 */
function generateSuggestedQuestions(
  category: string,
  entity: string,
  condition: Record<string, unknown>
): string[] {
  const field = String(condition.field ?? "");
  const operator = String(condition.operator ?? "");
  const value = String(condition.value ?? "");

  const entityLabel = entity
    .replace(/([A-Z])/g, " $1")
    .trim()
    .toLowerCase();

  switch (category) {
    case "THRESHOLD":
      if (field.includes("reorder") || field.includes("quantity")) {
        return [
          "Which SKUs are currently below their reorder point?",
          "How many items are at risk of stockout this week?",
        ];
      }
      if (field.includes("safety") || field.includes("stock")) {
        return [
          `Which items have less than ${value} units of safety stock?`,
          "What's our current safety stock coverage by item class?",
        ];
      }
      return [
        `Which ${entityLabel}s currently ${operator === "lt" ? "fall below" : "exceed"} ${value} for ${field}?`,
        `How many ${entityLabel}s are flagged by this rule right now?`,
      ];

    case "POLICY":
      if (entity === "Supplier" || field.includes("supplier")) {
        return [
          "Do any of our critical components have only one supplier?",
          "Which SKUs are most exposed to single-supplier risk?",
        ];
      }
      return [
        `Are there any ${entityLabel}s that violate this policy?`,
        `Show me a summary of ${entityLabel} compliance with our policies.`,
      ];

    case "CONSTRAINT":
      return [
        `Which ${entityLabel}s are currently violating this constraint?`,
        `How many ${entityLabel}s are close to breaching the ${field} limit?`,
      ];

    case "KPI":
      if (field.includes("reorder")) {
        return [
          "What are the current reorder points for our top 10 SKUs?",
          "Which items have a reorder point we haven't reached yet?",
        ];
      }
      return [
        `What's the current ${field} across all ${entityLabel}s?`,
        `Show me the top 10 ${entityLabel}s ranked by ${field}.`,
      ];

    default:
      return [
        `Show me which ${entityLabel}s are affected by my rules.`,
        `Give me a summary of my ${entityLabel} data.`,
      ];
  }
}
