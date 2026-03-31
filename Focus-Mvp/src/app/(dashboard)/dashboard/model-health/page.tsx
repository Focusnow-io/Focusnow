"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Lock,
  Upload,
  AlertTriangle,
  RefreshCw,
  Activity,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CapabilityMissing {
  entity: string;
  count: number;
  description: string;
}

interface Capability {
  id: string;
  name: string;
  description: string;
  unlocked: boolean;
  coverage: number;
  missing: CapabilityMissing[];
  failedGates: string[];
}

interface CompletenessReport {
  overallScore: number;
  unlockedCount: number;
  totalCount: number;
  consistencyIssues: number;
  capabilities: Capability[];
}

interface EntityFreshness {
  entityType: string;
  label: string;
  recordCount: number;
  lastUpdated: string | null;
  status: "fresh" | "stale" | "never";
  dataQualityScore: number;
}

interface FreshnessReport {
  entities: EntityFreshness[];
}

interface DedupCandidate {
  id: string;
  name: string;
}

interface PendingResolution {
  id: string;
  entityType: string;
  confidence: number;
  candidates: DedupCandidate[];
}

interface ResolutionReport {
  total: number;
  items: PendingResolution[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score <= 40) return "text-red-500";
  if (score <= 70) return "text-amber-500";
  return "text-green-500";
}

function scoreBgColor(score: number): string {
  if (score <= 40) return "bg-red-500";
  if (score <= 70) return "bg-amber-500";
  return "bg-green-500";
}

function scoreLabel(score: number): string {
  if (score <= 40) return "Needs work";
  if (score <= 70) return "Getting there";
  return "Ready";
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ProgressBar({
  value,
  colorClass,
}: {
  value: number;
  colorClass: string;
}) {
  return (
    <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
      <div
        className={cn("h-full rounded-full transition-all duration-500", colorClass)}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

function ScoreProgressBar({ value }: { value: number }) {
  return (
    <div className="w-full h-2.5 bg-muted rounded-full overflow-hidden">
      <div
        className={cn(
          "h-full rounded-full transition-all duration-700",
          scoreBgColor(value)
        )}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div className={cn("animate-pulse bg-muted rounded-xl", className)} />
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <SkeletonBlock className="h-7 w-48 mb-2" />
        <SkeletonBlock className="h-4 w-72" />
      </div>
      <SkeletonBlock className="h-36" />
      <div>
        <SkeletonBlock className="h-5 w-36 mb-4" />
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 7 }).map((_, i) => (
            <SkeletonBlock key={i} className="h-40" />
          ))}
        </div>
      </div>
      <SkeletonBlock className="h-64" />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-5">
      <div
        className="w-14 h-14 rounded-2xl flex items-center justify-center"
        style={{ background: "hsl(240 7% 96%)" }}
      >
        <Activity className="w-7 h-7" style={{ color: "hsl(240 5% 55%)" }} />
      </div>
      <div className="text-center">
        <h2 className="text-lg font-semibold text-foreground">No data imported yet</h2>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">
          Import your first file to see your model health score and unlock AI capabilities.
        </p>
      </div>
      <Button asChild>
        <Link href="/data/import">
          <Upload className="w-4 h-4 mr-2" />
          Import your first file
        </Link>
      </Button>
    </div>
  );
}

function CapabilityCard({ cap }: { cap: Capability }) {
  const coverageColor = cap.unlocked
    ? scoreBgColor(cap.coverage)
    : "bg-muted-foreground/30";

  return (
    <Card
      className={cn(
        "flex flex-col",
        !cap.unlocked && "opacity-80"
      )}
    >
      <CardContent className="pt-5 flex flex-col gap-3 flex-1">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              {cap.unlocked ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-green-500" />
              ) : (
                <Lock className="w-4 h-4 shrink-0 text-muted-foreground" />
              )}
              <span className="text-sm font-semibold text-foreground truncate">
                {cap.name}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">
              {cap.description}
            </p>
          </div>
          <span
            className={cn(
              "text-xs font-semibold tabular-nums shrink-0",
              cap.unlocked ? scoreColor(cap.coverage) : "text-muted-foreground"
            )}
          >
            {cap.coverage}%
          </span>
        </div>

        {/* Progress bar */}
        <ProgressBar value={cap.coverage} colorClass={coverageColor} />

        {/* Missing / locked items */}
        {!cap.unlocked && (cap.missing.length > 0 || cap.failedGates.length > 0) && (
          <ul className="space-y-1">
            {cap.missing.map((m, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <span className="mt-0.5 w-1 h-1 rounded-full bg-muted-foreground/50 shrink-0 mt-1.5" />
                {m.description}
                {m.count > 0 && (
                  <span className="ml-auto shrink-0 font-medium tabular-nums">
                    +{m.count} needed
                  </span>
                )}
              </li>
            ))}
            {cap.failedGates.map((gate, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5 text-amber-500" />
                {gate}
              </li>
            ))}
          </ul>
        )}

        {/* Locked: failed gates even when partially unlocked */}
        {cap.unlocked && cap.failedGates.length > 0 && (
          <ul className="space-y-1">
            {cap.failedGates.map((gate, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5 text-amber-500" />
                {gate}
              </li>
            ))}
          </ul>
        )}

        {/* Upload CTA for locked capabilities */}
        {!cap.unlocked && (
          <div className="mt-auto pt-1">
            <Button variant="outline" size="sm" className="w-full text-xs h-7" asChild>
              <Link href="/data/import">
                <Upload className="w-3 h-3 mr-1.5" />
                Upload data
              </Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FreshnessTable({ entities }: { entities: EntityFreshness[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b" style={{ borderColor: "hsl(240 7% 91%)" }}>
            {["Entity Type", "Records", "Last Updated", "Quality", "Status", ""].map((h) => (
              <th
                key={h}
                className="text-left py-2.5 px-3 text-xs font-medium text-muted-foreground first:pl-0 last:pr-0"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y" style={{ borderColor: "hsl(240 7% 95%)" }}>
          {entities.map((entity) => {
            const isStale = entity.status === "stale";
            return (
              <tr
                key={entity.entityType}
                className={cn(
                  "transition-colors",
                  isStale && "bg-amber-50/60 dark:bg-amber-900/10"
                )}
              >
                <td className="py-3 px-3 pl-0 font-medium text-foreground">
                  {entity.label}
                </td>
                <td className="py-3 px-3 tabular-nums text-foreground">
                  {entity.recordCount.toLocaleString()}
                </td>
                <td className="py-3 px-3 text-muted-foreground">
                  {formatDate(entity.lastUpdated)}
                </td>
                <td className="py-3 px-3">
                  <div className="flex items-center gap-2 min-w-[80px]">
                    <ProgressBar
                      value={entity.dataQualityScore}
                      colorClass={scoreBgColor(entity.dataQualityScore)}
                    />
                    <span
                      className={cn(
                        "text-xs font-medium tabular-nums shrink-0",
                        scoreColor(entity.dataQualityScore)
                      )}
                    >
                      {entity.dataQualityScore}%
                    </span>
                  </div>
                </td>
                <td className="py-3 px-3">
                  <Badge
                    variant={
                      entity.status === "fresh"
                        ? "success"
                        : entity.status === "stale"
                        ? "warning"
                        : "secondary"
                    }
                  >
                    {entity.status === "fresh"
                      ? "Fresh"
                      : entity.status === "stale"
                      ? "Stale"
                      : "Never imported"}
                  </Badge>
                </td>
                <td className="py-3 px-3 pr-0 text-right">
                  <Link
                    href={`/data/import?entity=${entity.entityType}`}
                    className="text-xs font-medium transition-opacity hover:opacity-70"
                    style={{ color: "#4F6CF5" }}
                  >
                    Update now
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ModelHealthPage() {
  const [completeness, setCompleteness] = useState<CompletenessReport | null>(null);
  const [freshness, setFreshness] = useState<FreshnessReport | null>(null);
  const [resolution, setResolution] = useState<ResolutionReport | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    try {
      const [c, f, r] = await Promise.all([
        fetch("/api/normalization/completeness").then((res) => res.json()),
        fetch("/api/normalization/freshness").then((res) => res.json()),
        fetch("/api/normalization/resolution?status=PENDING").then((res) => res.json()),
      ]);
      setCompleteness(c as CompletenessReport);
      setFreshness(f as FreshnessReport);
      setResolution(r as ResolutionReport);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    // Poll completeness every 30s — updates automatically after background import
    const interval = setInterval(() => {
      fetch("/api/normalization/completeness")
        .then((res) => res.json())
        .then((data) => setCompleteness(data as CompletenessReport))
        .catch(() => undefined);
    }, 30_000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  if (loading) return <LoadingSkeleton />;

  // Empty state: no data at all
  const hasAnyData =
    completeness?.capabilities.some((c) => c.coverage > 0) ||
    freshness?.entities.some((e) => e.recordCount > 0);

  if (!hasAnyData) return <EmptyState />;

  const score = completeness?.overallScore ?? 0;
  const unlockedCount = completeness?.unlockedCount ?? 0;
  const totalCount = completeness?.totalCount ?? 7;
  const consistencyIssues = completeness?.consistencyIssues ?? 0;
  const capabilities = completeness?.capabilities ?? [];
  const entities = freshness?.entities ?? [];

  const lowQualityEntities = entities.filter(
    (e) => e.recordCount > 0 && e.dataQualityScore < 60
  );
  const pendingDedupCount = resolution?.total ?? 0;
  const showAttention =
    pendingDedupCount > 0 || consistencyIssues > 0 || lowQualityEntities.length > 0;

  return (
    <div className="space-y-6 w-full animate-fade-in">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Model Health
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            See whether your operational data is ready to power AI capabilities.
          </p>
        </div>
        <button
          onClick={() => fetchAll()}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* ── Section 1: Overall Readiness Score ─────────────────────────── */}
      <Card>
        <CardContent className="pt-6 pb-6">
          <div className="flex items-center gap-8">
            {/* Big score */}
            <div className="shrink-0 text-center w-28">
              <div className={cn("text-6xl font-bold tabular-nums leading-none", scoreColor(score))}>
                {score}
              </div>
              <div className="text-xs text-muted-foreground mt-1.5 font-medium uppercase tracking-wider">
                out of 100
              </div>
            </div>

            {/* Score details */}
            <div className="flex-1 min-w-0 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-base font-semibold text-foreground">
                  Overall Readiness
                </span>
                <Badge
                  variant={score <= 40 ? "destructive" : score <= 70 ? "warning" : "success"}
                  className="shrink-0"
                >
                  {scoreLabel(score)}
                </Badge>
              </div>
              <ScoreProgressBar value={score} />
              <p className="text-sm text-muted-foreground">
                Your operational model is ready for{" "}
                <span className="font-semibold text-foreground">
                  {unlockedCount} of {totalCount}
                </span>{" "}
                AI capabilities.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Section 2: AI Capabilities Grid ───────────────────────────── */}
      <div>
        <h2 className="text-base font-semibold text-foreground mb-3">
          AI Capabilities
        </h2>
        <div className="grid grid-cols-3 gap-4">
          {capabilities.map((cap) => (
            <CapabilityCard key={cap.id} cap={cap} />
          ))}
        </div>
      </div>

      {/* ── Section 3: Data Freshness Panel ───────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-foreground">
            Data Freshness
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Records updated within the last 7 days are considered fresh.
          </p>
        </CardHeader>
        <CardContent>
          {entities.length > 0 ? (
            <FreshnessTable entities={entities} />
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No entity data found.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Section 4: Attention Required (conditional) ───────────────── */}
      {showAttention && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Attention Required
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* (a) Dedup reviews */}
              {pendingDedupCount > 0 && (
                <div className="flex items-center justify-between gap-4 py-3 border-b last:border-0"
                  style={{ borderColor: "hsl(240 7% 93%)" }}
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {pendingDedupCount} potential duplicate{pendingDedupCount !== 1 ? "s" : ""} detected
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Products with matching names may be duplicates. Review and merge them.
                    </p>
                  </div>
                  <Button variant="outline" size="sm" className="shrink-0" asChild>
                    <Link href="/dashboard/dedup-review">Review</Link>
                  </Button>
                </div>
              )}

              {/* (b) Consistency issues */}
              {consistencyIssues > 0 && (
                <div className="flex items-center justify-between gap-4 py-3 border-b last:border-0"
                  style={{ borderColor: "hsl(240 7% 93%)" }}
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {consistencyIssues} inventory item{consistencyIssues !== 1 ? "s" : ""} without reorder points
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      These items have stock but no reorder threshold — they won&apos;t trigger alerts.
                    </p>
                  </div>
                  <Button variant="outline" size="sm" className="shrink-0" asChild>
                    <Link href="/data/inventory">Fix</Link>
                  </Button>
                </div>
              )}

              {/* (c) Low quality entity types */}
              {lowQualityEntities.length > 0 && (
                <div className="py-3">
                  <p className="text-sm font-medium text-foreground">
                    {lowQualityEntities.length} entity type{lowQualityEntities.length !== 1 ? "s" : ""} with low data quality
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    These entity types have data quality scores below 60% — missing fields reduce AI accuracy.
                  </p>
                  <div className="flex flex-wrap gap-2 mt-2.5">
                    {lowQualityEntities.map((e) => (
                      <div
                        key={e.entityType}
                        className="flex items-center gap-1.5 text-xs bg-muted rounded-md px-2.5 py-1"
                      >
                        <span className="font-medium text-foreground">{e.label}</span>
                        <span className={cn("font-semibold", scoreColor(e.dataQualityScore))}>
                          {e.dataQualityScore}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
