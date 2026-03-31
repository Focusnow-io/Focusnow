"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface UsageData {
  plan: string;
  daily: { used: number; limit: number; percentage: number; resetAt: string };
  weekly: { used: number; limit: number; percentage: number; resetAt: string };
}

const AVG_TOKENS_PER_INTERACTION = 3_000;

function estimateRemaining(used: number, limit: number): string {
  const remaining = Math.max(0, limit - used);
  const interactions = Math.floor(remaining / AVG_TOKENS_PER_INTERACTION);
  if (interactions === 0) return "limit reached";
  return `~${interactions} interaction${interactions !== 1 ? "s" : ""} left`;
}

function timeUntil(isoDate: string): string {
  const diff = new Date(isoDate).getTime() - Date.now();
  if (diff <= 0) return "now";
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours >= 24) return `${Math.floor(hours / 24)}d`;
  if (hours > 0) return `${hours}h`;
  return `${Math.floor(diff / (1000 * 60))}m`;
}

function barColor(pct: number): string {
  if (pct >= 90) return "bg-red-500";
  if (pct >= 70) return "bg-amber-500";
  return "bg-[hsl(var(--primary))]";
}

export function UsageBar() {
  const [data, setData] = useState<UsageData | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function fetchUsage() {
      try {
        const res = await fetch("/api/usage");
        if (res.ok && mounted) {
          setData(await res.json());
        }
      } catch {
        // Silently fail — non-critical UI
      }
    }
    fetchUsage();
    // Refresh every 60s
    const interval = setInterval(fetchUsage, 60_000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  if (!data) return null;

  const { daily, weekly } = data;
  const isBlocked = daily.percentage >= 100 || weekly.percentage >= 100;

  return (
    <div
      className="px-3 py-2.5"
      style={{ borderTop: "1px solid hsl(var(--surface-nav-border))" }}
    >
      <button
        onClick={() => setExpanded((p) => !p)}
        className="w-full text-left"
      >
        {/* Compact view: daily bar */}
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] font-medium text-[hsl(var(--surface-nav-text-muted))]">
            {isBlocked ? "Limit reached" : "Daily AI usage"}
          </span>
          <span className="text-[11px] text-[hsl(var(--surface-nav-text-muted))] opacity-70">
            {isBlocked ? "Resets at midnight UTC" : `${daily.percentage}% · ${estimateRemaining(daily.used, daily.limit)}`}
          </span>
        </div>
        <div className="w-full h-1.5 rounded-full bg-[hsl(var(--surface-nav-hover))] overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all duration-300", barColor(daily.percentage))}
            style={{ width: `${Math.min(100, daily.percentage)}%` }}
          />
        </div>
      </button>

      {/* Expanded: weekly bar + reset info */}
      {expanded && (
        <div className="mt-2 space-y-1.5">
          <div>
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[11px] text-[hsl(var(--surface-nav-text-muted))]">
                This week
              </span>
              <span className="text-[11px] text-[hsl(var(--surface-nav-text-muted))] opacity-70">
                {weekly.percentage}% · {estimateRemaining(weekly.used, weekly.limit)}
              </span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-[hsl(var(--surface-nav-hover))] overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all duration-300", barColor(weekly.percentage))}
                style={{ width: `${Math.min(100, weekly.percentage)}%` }}
              />
            </div>
          </div>
          <div className="flex justify-between text-[10px] text-[hsl(var(--surface-nav-text-muted))] opacity-50">
            <span>Daily resets in {timeUntil(daily.resetAt)}</span>
            <span>Weekly resets in {timeUntil(weekly.resetAt)}</span>
          </div>
          {isBlocked && (
            <p className="text-[11px] text-red-400 mt-1">
              Token limit reached. Resets in {timeUntil(
                daily.percentage >= 100 ? daily.resetAt : weekly.resetAt
              )}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
