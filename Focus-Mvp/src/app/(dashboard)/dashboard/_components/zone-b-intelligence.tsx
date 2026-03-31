import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  MessageSquare,
} from "lucide-react";
import type { DashboardData } from "../_lib/types";

interface ZoneBIntelligenceProps {
  data: DashboardData;
}

/** Accent color per state. */
const STATE_ACCENT = {
  NEW: {
    stripe: "hsl(214 89% 52%)",
    bg: "hsl(214 89% 52% / 0.05)",
  },
  DATA_ONLY: {
    stripe: "#F04A00",
    bg: "hsl(19 100% 47% / 0.05)",
  },
  DATA_AND_BRAIN: {
    stripe: "hsl(38 92% 50%)",
    bg: "hsl(38 90% 50% / 0.05)",
  },
  ACTIVE: {
    stripe: "hsl(214 89% 52%)",
    bg: "hsl(214 89% 52% / 0.03)",
  },
} as const;

export function ZoneBIntelligence({ data }: ZoneBIntelligenceProps) {
  const accent = STATE_ACCENT[data.journeyState];

  return (
    <div
      className="rounded-xl border border-border overflow-hidden shadow-[0_1px_3px_hsl(var(--foreground)/0.04)]"
      style={{ background: accent.bg }}
    >
      <div
        className="p-6"
        style={{ borderLeft: `3px solid ${accent.stripe}` }}
      >
        <div className="space-y-3">
          <StateContent data={data} />
        </div>
      </div>
    </div>
  );
}

function StateContent({ data }: { data: DashboardData }) {
  switch (data.journeyState) {
    case "NEW":
      return (
        <>
          <div>
            <h2 className="text-base font-semibold text-foreground leading-snug">
              Start by importing your operational data.
            </h2>
            <p className="text-[15px] text-muted-foreground mt-1.5 leading-relaxed max-w-xl">
              Upload a CSV with your products, suppliers, inventory, or orders.
            </p>
          </div>
          <Button size="sm" asChild>
            <Link href="/data/import">
              Import data
              <ArrowRight className="w-3 h-3" />
            </Link>
          </Button>
        </>
      );

    case "DATA_ONLY":
      return (
        <>
          <div>
            <h2 className="text-base font-semibold text-foreground leading-snug">
              Your data is in. Now teach Focus how your operations work.
            </h2>
            <p className="text-[15px] text-muted-foreground mt-1.5 leading-relaxed max-w-xl">
              {formatDataSummary(data)} loaded. Data alone gives Focus facts.
              Rules give Focus judgment. Add your first rule to tell Focus how
              your business actually runs.
            </p>
          </div>
          <Button size="sm" asChild>
            <Link href="/brain/new">
              Create your first rule
              <ArrowRight className="w-3 h-3" />
            </Link>
          </Button>
        </>
      );

    case "DATA_AND_BRAIN":
      return (
        <>
          <div>
            <h2 className="text-base font-semibold text-foreground leading-snug">
              Your Brain has {data.activeRuleCount} rule
              {data.activeRuleCount !== 1 ? "s" : ""}. Try asking something it covers.
            </h2>
            <p className="text-[15px] text-muted-foreground mt-1.5 leading-relaxed max-w-xl">
              {data.ruleDomains.length > 0
                ? `Your rules cover ${data.ruleDomains.join(" and ")}. `
                : ""}
              Head to AI Chat and ask a question. Focus will use your rules as
              context to give you a specific, grounded answer — not a generic one.
            </p>
          </div>
          <Button size="sm" asChild>
            <Link href="/apps/chat">
              Ask Focus
              <ArrowRight className="w-3 h-3" />
            </Link>
          </Button>
        </>
      );

    case "ACTIVE":
      return (
        <>
          <div>
            <h2 className="text-base font-semibold text-foreground leading-snug">
              Everything is running smoothly
            </h2>
            <div className="flex items-center gap-5 mt-2.5 text-[15px] text-muted-foreground">
              <span className="text-[15px]"><strong className="text-foreground font-semibold text-base">{data.activeRuleCount}</strong> {data.activeRuleCount === 1 ? "rule" : "rules"}</span>
              <span className="text-border">·</span>
              <span className="text-[15px]"><strong className="text-foreground font-semibold text-base">{data.activeAppCount}</strong> {data.activeAppCount === 1 ? "app" : "apps"}</span>
              <span className="text-border">·</span>
              <span className="text-[15px]"><strong className="text-foreground font-semibold text-base">{data.productCount.toLocaleString()}</strong> products</span>
              <span className="text-border">·</span>
              <span className="text-[15px]"><strong className="text-foreground font-semibold text-base">{data.supplierCount.toLocaleString()}</strong> suppliers</span>
            </div>
            <p className="text-sm text-muted-foreground mt-3">
              Tip: {getActiveTip(data)}
            </p>
          </div>
          <Button size="sm" variant="outline" asChild>
            <Link href="/apps/chat">
              <MessageSquare className="w-3 h-3" />
              Ask Focus anything
            </Link>
          </Button>
        </>
      );
  }
}

function getActiveTip(data: DashboardData): string {
  if (data.activeRuleCount < 3) {
    return "Add more rules to strengthen your operational brain. The more logic you capture, the smarter your apps become.";
  }
  if (data.activeAppCount < 2) {
    return "Try building a custom dashboard with AI — describe what you need and Focus will generate it from your data.";
  }
  return "Use Data Chat to ask questions about your operations in plain English. It knows your rules and data.";
}

function formatDataSummary(data: DashboardData): string {
  const parts: string[] = [];
  if (data.productCount > 0)
    parts.push(`${data.productCount.toLocaleString()} products`);
  if (data.supplierCount > 0)
    parts.push(`${data.supplierCount.toLocaleString()} suppliers`);
  if (data.inventoryCount > 0)
    parts.push(`${data.inventoryCount.toLocaleString()} inventory items`);
  if (data.orderCount > 0)
    parts.push(`${data.orderCount.toLocaleString()} orders`);
  if (parts.length === 0) return "Your data is";
  if (parts.length === 1) return parts[0];
  return parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1];
}
