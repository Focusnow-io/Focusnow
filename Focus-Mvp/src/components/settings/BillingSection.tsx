"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface BillingData {
  plan: string;
}

interface UsageBucket {
  used: number;
  limit: number;
  percentage: number;
  resetAt: string;
}

interface UsageResponse {
  plan: string;
  daily: UsageBucket;
  weekly: UsageBucket;
  byFeature: {
    daily: Record<string, number>;
    weekly: Record<string, number>;
  };
}

const FEATURE_LABELS: Record<string, string> = {
  chat: "Data Chat",
  "apps-chat": "Apps Chat",
  "widget-insight": "Widget Insights",
  "brain-parse": "Brain Rules",
  generate: "App Generation",
};

const AVG_TOKENS_PER_INTERACTION = 3_000;

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function barColor(pct: number): string {
  if (pct >= 90) return "bg-red-500";
  if (pct >= 70) return "bg-amber-500";
  return "bg-primary";
}

function UsageMeter({ label, bucket }: { label: string; bucket: UsageBucket }) {
  const remaining = Math.max(0, bucket.limit - bucket.used);
  const interactionsLeft = Math.floor(remaining / AVG_TOKENS_PER_INTERACTION);

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium">{label} — {bucket.percentage}%</span>
        <span className="text-sm text-muted-foreground">
          {interactionsLeft > 0
            ? `~${interactionsLeft} interaction${interactionsLeft !== 1 ? "s" : ""} remaining`
            : "Limit reached"
          }
        </span>
      </div>
      <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-300", barColor(bucket.percentage))}
          style={{ width: `${Math.min(100, bucket.percentage)}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground mt-0.5">
        {formatTokens(bucket.used)} / {formatTokens(bucket.limit)} tokens · Resets {new Date(bucket.resetAt).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} at midnight UTC
      </p>
    </div>
  );
}

export function BillingSection({ data }: { data: BillingData }) {
  const isPilot = data.plan === "free" || data.plan === "pilot";
  const [usage, setUsage] = useState<UsageResponse | null>(null);

  useEffect(() => {
    fetch("/api/usage")
      .then((r) => (r.ok ? r.json() : null))
      .then(setUsage)
      .catch(() => {});
  }, []);

  return (
    <div id="billing" className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Plan & Billing</h2>
        <p className="text-sm text-muted-foreground">Your current plan and usage.</p>
      </div>

      <div className="rounded-lg border border-border p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Current plan</span>
          <Badge variant="success">
            {isPilot ? "Pilot Plan" : data.plan}
          </Badge>
        </div>

        {isPilot ? (
          <>
            <p className="text-sm text-muted-foreground">
              You are on a pilot plan — complimentary access.
            </p>
            <p className="text-sm text-muted-foreground">
              Contact us to discuss pricing:{" "}
              <a
                href="mailto:hello@getfocus.ai"
                className="text-primary underline underline-offset-2 hover:text-primary/80"
              >
                hello@getfocus.ai
              </a>
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Manage your subscription and billing details.
          </p>
        )}
      </div>

      {/* Usage section */}
      {usage && (
        <div className="rounded-lg border border-border p-4 space-y-4">
          <h3 className="text-sm font-semibold">Token Usage</h3>

          <UsageMeter label="Today" bucket={usage.daily} />
          <UsageMeter label="This week" bucket={usage.weekly} />

          {/* Feature breakdown */}
          {Object.keys(usage.byFeature.daily).length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
                Today by feature
              </h4>
              <div className="space-y-1">
                {Object.entries(usage.byFeature.daily)
                  .sort(([, a], [, b]) => b - a)
                  .map(([feature, tokens]) => (
                    <div key={feature} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        {FEATURE_LABELS[feature] ?? feature}
                      </span>
                      <span className="font-mono text-xs">
                        {formatTokens(tokens)}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
