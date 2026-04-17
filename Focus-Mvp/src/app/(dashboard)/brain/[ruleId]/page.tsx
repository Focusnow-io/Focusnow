"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  GitBranch,
  Clock,
  CheckCircle,
  ArrowLeft,
  Trash2,
  Pencil,
  Copy,
  Eye,
  Loader2,
  AlertTriangle,
  Archive,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import { flattenSample } from "../_lib/helpers";
import InteractiveSummary from "../_components/InteractiveSummary";
import { OnboardingNudge } from "@/components/onboarding/OnboardingNudge";
import { useOnboardingStage } from "@/components/onboarding/useOnboardingStage";

// ── Types ───────────────────────────────────────────────────────

interface Version {
  id: string;
  version: number;
  commitMessage: string | null;
  committedBy: string;
  committedAt: string;
  snapshot: Record<string, unknown>;
}

interface Rule {
  id: string;
  name: string;
  description: string | null;
  category: string;
  entity: string;
  condition: Record<string, unknown>;
  status: string;
  currentVersion: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  versions: Version[];
}

interface PreviewData {
  matchCount: number;
  totalCount: number;
  samples: Record<string, unknown>[];
}

// ── Component ───────────────────────────────────────────────────

export default function RuleDetailPage() {
  const params = useParams();
  const router = useRouter();
  const ruleId = params.ruleId as string;
  const [rule, setRule] = useState<Rule | null>(null);
  const [loading, setLoading] = useState(true);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [versionSnapshot, setVersionSnapshot] = useState<Version | null>(null);

  // Live preview state
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Onboarding: show "Ask Focus" nudge after first rule is saved
  const { stage: onboardingStage, isDismissed, dismiss } = useOnboardingStage();
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const showAskFocusNudge =
    rule?.status === "ACTIVE" &&
    onboardingStage === "aha" &&
    !nudgeDismissed &&
    !isDismissed("step2c");

  useEffect(() => {
    fetch(`/api/brain/rules/${ruleId}`)
      .then((r) => r.json())
      .then((d) => {
        setRule(d);
        setLoading(false);
      });
  }, [ruleId]);

  // Fetch live preview when rule loads
  const fetchPreview = useCallback(async (r: Rule) => {
    setPreviewLoading(true);
    try {
      const res = await fetch("/api/brain/rules/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: r.entity,
          condition: r.condition,
        }),
      });
      if (res.ok) {
        setPreview(await res.json());
      }
    } catch {
      // Preview is non-critical
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  useEffect(() => {
    if (rule) fetchPreview(rule);
  }, [rule, fetchPreview]);

  async function handlePublish() {
    setPublishing(true);
    await fetch(`/api/brain/rules/${ruleId}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commitMessage }),
    });
    setPublishing(false);
    setPublishDialogOpen(false);
    // Re-fetch the full rule to get updated versions
    fetch(`/api/brain/rules/${ruleId}`)
      .then((r) => r.json())
      .then((d) => setRule(d));
  }

  async function handleDeactivate() {
    if (!confirm("Deactivate this rule? It will no longer be active.")) return;
    setDeactivating(true);
    await fetch(`/api/brain/rules/${ruleId}/deactivate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commitMessage: "Rule deactivated" }),
    });
    // Re-fetch
    const r = await fetch(`/api/brain/rules/${ruleId}`);
    setRule(await r.json());
    setDeactivating(false);
  }

  async function handleDelete() {
    if (!confirm("Delete this rule and all its versions?")) return;
    await fetch(`/api/brain/rules/${ruleId}`, { method: "DELETE" });
    router.push("/brain");
  }

  if (loading) {
    return (
      <div className="py-12 text-center text-muted-foreground text-sm">Loading...</div>
    );
  }

  if (!rule) {
    return (
      <div className="py-12 text-center text-muted-foreground text-sm">
        Rule not found
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6 mx-auto w-full">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push("/brain")}
          className="mt-0.5"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-foreground">{rule.name}</h1>
            <Badge
              variant={
                rule.status === "ACTIVE"
                  ? "success"
                  : rule.status === "DRAFT"
                    ? "warning"
                    : "outline"
              }
            >
              {rule.status.toLowerCase()}
            </Badge>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <GitBranch className="w-3 h-3" />
              v{rule.currentVersion}
            </span>
          </div>
          {rule.description && (
            <p className="text-sm text-muted-foreground mt-1">{rule.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="outline"
            onClick={() => router.push(`/brain/${ruleId}/edit`)}
          >
            <Pencil className="w-3.5 h-3.5 mr-1.5" />
            Edit
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => router.push(`/brain/new?duplicate=${ruleId}`)}
          >
            <Copy className="w-3.5 h-3.5 mr-1.5" />
            Duplicate
          </Button>
          {rule.status === "ACTIVE" && (
            <Button
              size="sm"
              variant="outline"
              className="text-amber-600 hover:bg-amber-50"
              onClick={handleDeactivate}
              disabled={deactivating}
            >
              <Archive className="w-3.5 h-3.5 mr-1.5" />
              {deactivating ? "Deactivating..." : "Deactivate"}
            </Button>
          )}
          {rule.status !== "ACTIVE" && rule.status !== "ARCHIVED" && (
            <Button size="sm" onClick={() => setPublishDialogOpen(true)}>
              <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
              Publish
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="text-red-600 hover:bg-red-50"
            onClick={handleDelete}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Plain-English summary — non-interactive tokens */}
      <Card className="border-blue-500/20 bg-blue-500/10">
        <CardContent className="p-4">
          <InteractiveSummary
            entity={rule.entity}
            condField={String(rule.condition.field ?? "")}
            condOperator={String(rule.condition.operator ?? "")}
            condValue={String(rule.condition.value ?? "")}
          />
        </CardContent>
      </Card>

      {/* Step 2c: Post-first-rule nudge to AI Chat */}
      {showAskFocusNudge && (
        <OnboardingNudge
          headline="Your first rule is live. Now ask Focus a question that uses it."
          body="Head to AI Chat and ask something related to this rule. Focus will use it to give you a grounded, specific answer."
          ctaLabel="Ask Focus"
          ctaHref="/apps/chat"
          dismissable
          onDismiss={() => {
            dismiss("step2c");
            setNudgeDismissed(true);
          }}
        />
      )}

      {/* Condition */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-semibold uppercase text-muted-foreground">
            Condition
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-slate-50 rounded-lg p-3 font-mono text-xs text-foreground">
            <p>
              <span className="text-blue-600">entity</span>: {rule.entity}
            </p>
            {Object.entries(rule.condition).map(([k, v]) =>
              k !== "entity" ? (
                <p key={k}>
                  <span className="text-blue-600">{k}</span>:{" "}
                  {JSON.stringify(v)}
                </p>
              ) : null
            )}
          </div>
        </CardContent>
      </Card>

      {/* Metadata */}
      <div className="grid grid-cols-3 gap-2 text-sm">
        {[
          { label: "Category", value: rule.category },
          { label: "Entity", value: rule.entity },
          { label: "Tags", value: rule.tags.join(", ") || "\u2014" },
        ].map(({ label, value }) => (
          <div key={label} className="bg-card border rounded-lg p-3">
            <p className="text-xs text-muted-foreground font-medium uppercase">
              {label}
            </p>
            <p className="font-medium mt-0.5">{value}</p>
          </div>
        ))}
      </div>

      {/* Live Match Count */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Eye className="w-4 h-4" />
            Live Data Match
          </CardTitle>
        </CardHeader>
        <CardContent>
          {previewLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-1">
              <Loader2 className="w-4 h-4 animate-spin" />
              Checking against your data...
            </div>
          ) : preview ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                {preview.matchCount === 0 ? (
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                ) : (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                )}
                <span className="text-sm font-medium">
                  Currently matching{" "}
                  <strong>{preview.matchCount}</strong> of{" "}
                  <strong>{preview.totalCount}</strong> items
                </span>
              </div>

              {preview.samples.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        {Object.keys(
                          flattenSample(preview.samples[0])
                        ).map((key) => (
                          <th key={key} className="pb-1.5 pr-3 font-medium">
                            {key}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.samples.map((sample, i) => {
                        const flat = flattenSample(sample);
                        return (
                          <tr key={i} className="border-b border-border">
                            {Object.values(flat).map((val, j) => (
                              <td
                                key={j}
                                className="py-1.5 pr-3 text-foreground"
                              >
                                {val}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Unable to load preview data.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Version history */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <GitBranch className="w-4 h-4" />
            Version history
          </CardTitle>
        </CardHeader>
        <CardContent>
          {rule.versions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No versions yet</p>
          ) : (
            <div className="relative">
              <div className="absolute left-3.5 top-0 bottom-0 w-px bg-border" />
              <div className="space-y-4">
                {rule.versions.map((v, i) => (
                  <div
                    key={v.id}
                    className="flex items-start gap-4 pl-9 relative"
                  >
                    <div className="absolute left-2 w-3 h-3 rounded-full border-2 border-slate-400 bg-card top-1" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-semibold text-slate-700">
                          v{v.version}
                        </span>
                        {i === 0 && (
                          <Badge
                            variant="info"
                            className="text-[10px] px-1.5 py-0"
                          >
                            current
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {v.commitMessage ?? "No message"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        {formatDate(v.committedAt)}
                        {v.snapshot && (
                          <button
                            type="button"
                            className="ml-2 text-blue-600 hover:underline"
                            onClick={() =>
                              setVersionSnapshot(
                                versionSnapshot?.id === v.id ? null : v
                              )
                            }
                          >
                            {versionSnapshot?.id === v.id ? "Hide" : "View"}
                          </button>
                        )}
                      </div>
                      {/* Inline version snapshot viewer */}
                      {versionSnapshot?.id === v.id && (
                        <div className="mt-2 bg-slate-50 border rounded-lg p-3 font-mono text-xs text-muted-foreground">
                          <pre className="whitespace-pre-wrap">
                            {JSON.stringify(v.snapshot, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Publish dialog */}
      <Dialog open={publishDialogOpen} onOpenChange={setPublishDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publish rule</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Publishing activates this rule and creates a new version snapshot.
              This is like committing to the operational brain.
            </p>
            <div className="space-y-1.5">
              <Label>Commit message</Label>
              <Input
                placeholder="What changed in this version?"
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPublishDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handlePublish} disabled={publishing}>
              {publishing ? "Publishing..." : "Publish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
