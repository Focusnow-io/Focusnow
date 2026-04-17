"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowLeft,
  Loader2,
  Eye,
  CheckCircle,
  AlertTriangle,
} from "lucide-react";
import {
  CATEGORIES,
  ENTITIES,
  OPERATORS,
  ENTITY_FIELDS,
} from "../../_lib/constants";
import { flattenSample } from "../../_lib/helpers";
import InteractiveSummary from "../../_components/InteractiveSummary";

// ── Types ───────────────────────────────────────────────────────

interface PreviewData {
  matchCount: number;
  totalCount: number;
  samples: Record<string, unknown>[];
}

// ── Component ───────────────────────────────────────────────────

export default function EditRulePage() {
  const params = useParams();
  const router = useRouter();
  const ruleId = params.ruleId as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    name: "",
    description: "",
    category: "THRESHOLD",
    entity: "InventoryItem",
    tags: "",
    condField: "quantity",
    condOperator: "lt",
    condValue: "100",
    commitMessage: "",
  });

  // Preview state
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load existing rule
  useEffect(() => {
    fetch(`/api/brain/rules/${ruleId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.id) {
          setForm({
            name: data.name || "",
            description: data.description || "",
            category: data.category || "THRESHOLD",
            entity: data.entity || "InventoryItem",
            tags: (data.tags || []).join(", "),
            condField: String(data.condition?.field || "quantity"),
            condOperator: String(data.condition?.operator || "lt"),
            condValue: String(data.condition?.value ?? "100"),
            commitMessage: "",
          });
        }
        setLoading(false);
      });
  }, [ruleId]);

  function set(key: keyof typeof form, val: string) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  // ── Live Preview ────────────────────────────────────────────

  const fetchPreview = useCallback(async () => {
    setPreviewLoading(true);
    try {
      const res = await fetch("/api/brain/rules/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: form.entity,
          condition: {
            field: form.condField,
            operator: form.condOperator,
            value: isNaN(Number(form.condValue))
              ? form.condValue
              : Number(form.condValue),
          },
        }),
      });
      if (res.ok) {
        setPreview(await res.json());
      } else {
        setPreview(null);
      }
    } catch {
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  }, [form.entity, form.condField, form.condOperator, form.condValue]);

  useEffect(() => {
    if (loading) return;
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    previewTimerRef.current = setTimeout(() => {
      fetchPreview();
    }, 500);
    return () => {
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    };
  }, [loading, fetchPreview]);

  // ── Save ────────────────────────────────────────────────────

  async function handleSave() {
    setError("");
    setSaving(true);

    const payload = {
      name: form.name,
      description: form.description || undefined,
      category: form.category,
      entity: form.entity,
      tags: form.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      condition: {
        field: form.condField,
        operator: form.condOperator,
        value: isNaN(Number(form.condValue))
          ? form.condValue
          : Number(form.condValue),
        entity: form.entity,
      },
      commitMessage: form.commitMessage || "Rule updated",
    };

    try {
      const res = await fetch(`/api/brain/rules/${ruleId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error("Failed to update rule");
      }

      router.push(`/brain/${ruleId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update rule");
      setSaving(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="py-12 text-center text-gray-400 text-sm">Loading...</div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto w-full space-y-5">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push(`/brain/${ruleId}`)}
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Edit Rule</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Changes will create a new version automatically
          </p>
        </div>
      </div>

      {/* Interactive plain-English summary */}
      <Card className="border-blue-500/20 bg-blue-500/10">
        <CardContent className="p-4">
          <InteractiveSummary
            entity={form.entity}
            condField={form.condField}
            condOperator={form.condOperator}
            condValue={form.condValue}
            interactive
          />
        </CardContent>
      </Card>

      {/* Rule definition */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">
            Rule definition
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Rule name</Label>
            <Input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              rows={2}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5" id="field-entity">
              <Label>Entity</Label>
              <Select
                value={form.entity}
                onValueChange={(v) => {
                  set("entity", v);
                  const fields = ENTITY_FIELDS[v] ?? [];
                  if (fields.length > 0) set("condField", fields[0]);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENTITIES.map((e) => (
                    <SelectItem key={e} value={e}>
                      {e}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select
                value={form.category}
                onValueChange={(v) => set("category", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Tags (comma-separated)</Label>
            <Input
              value={form.tags}
              onChange={(e) => set("tags", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Condition */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Condition</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-1.5" id="field-condField">
              <Label>Field</Label>
              <Select
                value={form.condField}
                onValueChange={(v) => set("condField", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(ENTITY_FIELDS[form.entity] ?? []).map((f) => (
                    <SelectItem key={f} value={f}>
                      {f}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 space-y-1.5" id="field-condOperator">
              <Label>Operator</Label>
              <Select
                value={form.condOperator}
                onValueChange={(v) => set("condOperator", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OPERATORS.map((op) => (
                    <SelectItem key={op.value} value={op.value}>
                      {op.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-28 space-y-1.5" id="field-condValue">
              <Label>Value</Label>
              <Input
                value={form.condValue}
                onChange={(e) => set("condValue", e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Live Preview */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Eye className="w-4 h-4" />
            Live Preview
          </CardTitle>
        </CardHeader>
        <CardContent>
          {previewLoading ? (
            <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
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
                  This rule currently matches{" "}
                  <strong>{preview.matchCount}</strong> of{" "}
                  <strong>{preview.totalCount}</strong> items
                </span>
              </div>

              {preview.matchCount === 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded px-3 py-2 text-xs text-amber-700">
                  No items currently match this rule. The rule will still be
                  saved and will apply when conditions are met.
                </div>
              )}
              {preview.totalCount > 0 &&
                preview.matchCount === preview.totalCount && (
                  <div className="bg-amber-50 border border-amber-200 rounded px-3 py-2 text-xs text-amber-700">
                    This rule matches all items. Check your threshold value.
                  </div>
                )}

              {preview.samples.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b text-left text-gray-500">
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
                          <tr key={i} className="border-b border-gray-100">
                            {Object.values(flat).map((val, j) => (
                              <td
                                key={j}
                                className="py-1.5 pr-3 text-gray-700"
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
            <p className="text-sm text-gray-400 py-2">
              Preview will appear once the condition is set.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Commit message */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="space-y-1.5">
            <Label>What changed? (optional)</Label>
            <Input
              placeholder="e.g. Lowered threshold from 100 to 50"
              value={form.commitMessage}
              onChange={(e) => set("commitMessage", e.target.value)}
            />
            <p className="text-xs text-gray-400">
              This creates a new version — the previous version will be
              preserved.
            </p>
          </div>
        </CardContent>
      </Card>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <Button onClick={handleSave} disabled={saving || !form.name.trim()}>
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            "Save Changes"
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push(`/brain/${ruleId}`)}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
