"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
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
import {
  Brain,
  Sparkles,
  ArrowLeft,
  ArrowUp,
  Loader2,
  AlertTriangle,
  CheckCircle,
  Eye,
  MessageCircle,
  PenLine,
  ChevronRight,
} from "lucide-react";
import {
  CATEGORIES,
  ENTITIES,
  OPERATORS,
  ENTITY_FIELDS,
} from "../_lib/constants";
import { flattenSample } from "../_lib/helpers";
import { getRelevantPrompts } from "../_lib/example-prompts";
import InteractiveSummary from "../_components/InteractiveSummary";

// ── Types ───────────────────────────────────────────────────

type FlowStep = "input" | "loading" | "clarify" | "review";

interface PreviewData {
  matchCount: number;
  totalCount: number;
  samples: Record<string, unknown>[];
}

// ── Component ───────────────────────────────────────────────

export default function NewRulePage() {
  const router = useRouter();

  // Flow state
  const [step, setStep] = useState<FlowStep>("input");
  const [nlPrompt, setNlPrompt] = useState("");
  const [aiError, setAiError] = useState("");
  const [clarifyingQuestion, setClarifyingQuestion] = useState("");
  const [suggestedAnswers, setSuggestedAnswers] = useState<string[]>([]);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [clarificationAnswer, setClarificationAnswer] = useState("");
  const [showOtherInput, setShowOtherInput] = useState(false);
  const [clarifyLoading, setClarifyLoading] = useState(false);

  // Structured form state
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

  // Save state
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  // Data-aware example prompts
  const [examplePrompts, setExamplePrompts] = useState<string[]>([]);

  // Textarea ref for auto-resize
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetch("/api/brain/entities")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.entities) {
          const names = data.entities.map((e: { name: string }) => e.name);
          setExamplePrompts(getRelevantPrompts(names));
        } else {
          setExamplePrompts(getRelevantPrompts([]));
        }
      })
      .catch(() => setExamplePrompts(getRelevantPrompts([])));
  }, []);

  // ── Helpers ─────────────────────────────────────────────────

  function set(key: keyof typeof form, val: string) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  function handleTextareaChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setNlPrompt(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  // ── AI Parse ────────────────────────────────────────────────

  async function handleParse(prompt: string) {
    setStep("loading");
    setAiError("");
    setClarifyingQuestion("");

    try {
      const res = await fetch("/api/brain/rules/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to parse rule");
      }

      const parsed = await res.json();

      // Pre-fill form from AI response
      setForm((f) => ({
        ...f,
        name: parsed.name || f.name,
        description: parsed.description || f.description,
        category: CATEGORIES.includes(parsed.category) ? parsed.category : f.category,
        entity: ENTITIES.includes(parsed.entity) ? parsed.entity : f.entity,
        condField: parsed.condition?.field || f.condField,
        condOperator: parsed.condition?.operator || f.condOperator,
        condValue: String(parsed.condition?.value ?? f.condValue),
      }));

      if (parsed.clarifyingQuestion) {
        setClarifyingQuestion(parsed.clarifyingQuestion);
        setSuggestedAnswers(
          Array.isArray(parsed.suggestedAnswers) ? parsed.suggestedAnswers : []
        );
        setSelectedOption(null);
        setClarificationAnswer("");
        setShowOtherInput(false);
        setStep("clarify");
      } else {
        setStep("review");
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "An unexpected error occurred");
      setStep("input");
    }
  }

  // ── Clarification Re-parse ─────────────────────────────────

  async function handleClarify() {
    setClarifyLoading(true);
    setAiError("");

    try {
      const res = await fetch("/api/brain/rules/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: nlPrompt,
          clarification: clarificationAnswer,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to parse rule");
      }

      const parsed = await res.json();

      setForm((f) => ({
        ...f,
        name: parsed.name || f.name,
        description: parsed.description || f.description,
        category: CATEGORIES.includes(parsed.category)
          ? parsed.category
          : f.category,
        entity: ENTITIES.includes(parsed.entity) ? parsed.entity : f.entity,
        condField: parsed.condition?.field || f.condField,
        condOperator: parsed.condition?.operator || f.condOperator,
        condValue: String(parsed.condition?.value ?? f.condValue),
      }));

      if (parsed.clarifyingQuestion) {
        setClarifyingQuestion(parsed.clarifyingQuestion);
        setSuggestedAnswers(
          Array.isArray(parsed.suggestedAnswers) ? parsed.suggestedAnswers : []
        );
        setSelectedOption(null);
        setClarificationAnswer("");
        setShowOtherInput(false);
      } else {
        setClarifyingQuestion("");
        setStep("review");
      }
    } catch (err) {
      setAiError(
        err instanceof Error ? err.message : "An unexpected error occurred"
      );
    } finally {
      setClarifyLoading(false);
    }
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
        const data = await res.json();
        setPreview(data);
      } else {
        setPreview(null);
      }
    } catch {
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  }, [form.entity, form.condField, form.condOperator, form.condValue]);

  // Debounced preview on condition change
  useEffect(() => {
    if (step !== "review") return;

    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    previewTimerRef.current = setTimeout(() => {
      fetchPreview();
    }, 500);

    return () => {
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    };
  }, [step, fetchPreview]);

  // ── Save ────────────────────────────────────────────────────

  async function handleSave() {
    setSaveError("");
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
      commitMessage: form.commitMessage || "Rule created",
    };

    try {
      const res = await fetch("/api/brain/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error?.formErrors?.[0] || "Failed to create rule");
      }

      router.push(`/brain/${data.id}`);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to create rule");
      setSaving(false);
    }
  }

  // ── Render: Step 1 — Natural Language Input ─────────────────

  if (step === "input" || step === "loading") {
    return (
      <div className="flex -m-6 h-[calc(100vh-3.25rem)] flex-col">
        {/* Header bar */}
        <div
          className="h-12 px-4 flex items-center gap-2 shrink-0 bg-card"
          style={{ borderBottom: "1px solid hsl(var(--border))" }}
        >
          <button
            onClick={() => router.push("/brain")}
            className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <Brain className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">New Rule</span>
        </div>

        {/* Centered content */}
        <div className="flex-1 overflow-y-auto">
          <div className="flex flex-col items-center justify-center min-h-[70vh] gap-8 px-4 py-12">
            {/* Hero */}
            <div className="text-center max-w-lg">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center mx-auto mb-5 shadow-lg shadow-blue-500/20">
                <Brain className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-xl font-semibold text-foreground">
                Describe a rule in your own words.
              </h1>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed max-w-md mx-auto">
                Don&apos;t worry about structure or format. Just explain it the
                way you&apos;d explain it to a new hire. Focus will do the rest.
              </p>
            </div>

            {/* Suggested prompts */}
            {examplePrompts.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-xl">
                {examplePrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    className="text-left px-4 py-3 rounded-xl border border-border bg-card hover:border-border hover:bg-muted text-sm text-foreground transition-colors disabled:opacity-40"
                    onClick={() => {
                      setNlPrompt(prompt);
                      handleParse(prompt);
                    }}
                    disabled={step === "loading"}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            )}

            {/* Error message */}
            {aiError && (
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm bg-red-50 border border-red-200 text-red-700 max-w-xl w-full">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {aiError}
              </div>
            )}
          </div>
        </div>

        {/* Input area — pinned to bottom like chat */}
        <div className="shrink-0 px-4 pb-4 pt-2">
          <div className="max-w-xl mx-auto">
            <div className="rounded-2xl border-2 border-blue-400 bg-card shadow-sm focus-within:border-blue-500 transition-colors">
              <textarea
                ref={textareaRef}
                rows={1}
                placeholder="e.g. &quot;Stock should not fall below reorder point for any SKU&quot;"
                value={nlPrompt}
                onChange={handleTextareaChange}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && nlPrompt.trim()) {
                    e.preventDefault();
                    handleParse(nlPrompt);
                  }
                }}
                disabled={step === "loading"}
                className="w-full px-4 pt-4 pb-2 text-sm bg-transparent resize-none focus:outline-none placeholder:text-muted-foreground disabled:opacity-60 text-foreground leading-relaxed"
                style={{ minHeight: "44px", maxHeight: "160px" }}
              />
              <div className="flex items-center justify-between px-4 pb-3">
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-muted-foreground transition-colors"
                  onClick={() => setStep("review")}
                >
                  Create manually instead
                </button>
                <button
                  onClick={() => nlPrompt.trim() && handleParse(nlPrompt)}
                  disabled={!nlPrompt.trim() || step === "loading"}
                  className="w-8 h-8 rounded-full bg-blue-500 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                >
                  {step === "loading" ? (
                    <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
                  ) : (
                    <ArrowUp className="w-3.5 h-3.5 text-white" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Render: Step 1.5 — Clarify ──────────────────────────────

  if (step === "clarify") {
    return (
      <div className="flex -m-6 h-[calc(100vh-3.25rem)] flex-col">
        {/* Header bar */}
        <div
          className="h-12 px-4 flex items-center gap-2 shrink-0 bg-card"
          style={{ borderBottom: "1px solid hsl(var(--border))" }}
        >
          <button
            onClick={() => setStep("input")}
            className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <Brain className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">Clarify Rule</span>
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto py-8">
          <div className="max-w-xl mx-auto px-4 space-y-5">
            {/* User's original prompt — right aligned bubble */}
            <div className="flex justify-end">
              <div className="max-w-[80%] bg-primary text-white rounded-2xl rounded-br-sm px-4 py-3 text-sm leading-relaxed">
                {nlPrompt}
              </div>
            </div>

            {/* AI's understanding — left aligned */}
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shrink-0 mt-0.5">
                  <Brain className="w-3.5 h-3.5 text-white" />
                </div>
                <div className="space-y-3 flex-1 min-w-0">
                  <div className="text-sm text-foreground leading-relaxed">
                    <p className="font-medium text-foreground mb-1.5">Here&apos;s what I understood:</p>
                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-3">
                      <InteractiveSummary
                        entity={form.entity}
                        condField={form.condField}
                        condOperator={form.condOperator}
                        condValue={form.condValue}
                      />
                    </div>
                  </div>

                  {/* Clarifying question */}
                  <div className="flex items-start gap-2 text-sm text-foreground">
                    <MessageCircle className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" />
                    <p>{clarifyingQuestion}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Suggested answers */}
            <div className="pl-10 space-y-2">
              {suggestedAnswers.map((answer, i) => (
                <button
                  key={i}
                  type="button"
                  disabled={clarifyLoading}
                  onClick={() => {
                    setSelectedOption(i);
                    setClarificationAnswer(answer);
                    setShowOtherInput(false);
                  }}
                  className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-all duration-150 ${
                    selectedOption === i
                      ? "border-blue-500/40 bg-blue-500/10 text-foreground shadow-sm"
                      : "border-border bg-card text-foreground hover:border-border hover:bg-muted"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${
                        selectedOption === i
                          ? "border-blue-500"
                          : "border-border"
                      }`}
                    >
                      {selectedOption === i && (
                        <div className="w-2 h-2 rounded-full bg-blue-500" />
                      )}
                    </div>
                    {answer}
                  </div>
                </button>
              ))}

              {/* Other — free text option */}
              <button
                type="button"
                disabled={clarifyLoading}
                onClick={() => {
                  setSelectedOption(null);
                  setShowOtherInput(true);
                  setClarificationAnswer("");
                }}
                className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-all duration-150 ${
                  showOtherInput
                    ? "border-blue-500/40 bg-blue-500/10 text-foreground shadow-sm"
                    : "border-border bg-card text-foreground hover:border-border hover:bg-muted"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${
                      showOtherInput ? "border-blue-500" : "border-border"
                    }`}
                  >
                    {showOtherInput && (
                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                    )}
                  </div>
                  <PenLine className="w-3.5 h-3.5 shrink-0" />
                  Other...
                </div>
              </button>

              {showOtherInput && (
                <div className="pl-7">
                  <Textarea
                    placeholder="Type your answer..."
                    value={clarificationAnswer}
                    onChange={(e) => setClarificationAnswer(e.target.value)}
                    rows={2}
                    autoFocus
                    disabled={clarifyLoading}
                    className="text-sm rounded-xl"
                    onKeyDown={(e) => {
                      if (
                        e.key === "Enter" &&
                        !e.shiftKey &&
                        clarificationAnswer.trim()
                      ) {
                        e.preventDefault();
                        handleClarify();
                      }
                    }}
                  />
                </div>
              )}
            </div>

            {/* Error */}
            {aiError && (
              <div className="pl-10 flex items-center gap-2 px-4 py-3 rounded-xl text-sm bg-red-50 border border-red-200 text-red-700">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {aiError}
              </div>
            )}
          </div>
        </div>

        {/* Bottom actions */}
        <div className="shrink-0 px-4 pb-4 pt-2">
          <div className="max-w-xl mx-auto flex gap-3">
            <Button
              onClick={handleClarify}
              disabled={!clarificationAnswer.trim() || clarifyLoading}
              className="gap-2"
            >
              {clarifyLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Refining...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Continue
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setClarifyingQuestion("");
                setStep("review");
              }}
              disabled={clarifyLoading}
            >
              Skip — use this interpretation
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Render: Step 2 — Review & Adjust Structured Form ────────

  return (
    <div className="flex -m-6 h-[calc(100vh-3.25rem)] flex-col">
      {/* Header bar */}
      <div
        className="h-12 px-4 flex items-center gap-2 shrink-0 bg-card"
        style={{ borderBottom: "1px solid hsl(var(--border))" }}
      >
        <button
          onClick={() => setStep("input")}
          className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <Eye className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">Review Rule</span>
        <span className="text-xs text-muted-foreground ml-1">Verify and adjust before saving</span>
      </div>

      {/* Scrollable form */}
      <div className="flex-1 overflow-y-auto py-6">
        <div className="max-w-2xl mx-auto px-4 space-y-5">
          {/* Interactive plain-English summary */}
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl px-5 py-4">
            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shrink-0 mt-0.5">
                <Sparkles className="w-3.5 h-3.5 text-white" />
              </div>
              <InteractiveSummary
                entity={form.entity}
                condField={form.condField}
                condOperator={form.condOperator}
                condValue={form.condValue}
                interactive
              />
            </div>
          </div>

          {/* Rule definition */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground">Rule definition</h3>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Rule name</Label>
                <Input
                  placeholder="e.g. Low stock reorder threshold"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  required
                  className="rounded-lg"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Description</Label>
                <Textarea
                  placeholder="What operational logic does this rule capture?"
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                  rows={2}
                  className="rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5" id="field-entity">
                  <Label className="text-xs font-medium text-muted-foreground">Entity</Label>
                  <Select
                    value={form.entity}
                    onValueChange={(v) => {
                      set("entity", v);
                      const fields = ENTITY_FIELDS[v] ?? [];
                      if (fields.length > 0) set("condField", fields[0]);
                    }}
                  >
                    <SelectTrigger className="rounded-lg">
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
                  <Label className="text-xs font-medium text-muted-foreground">Category</Label>
                  <Select
                    value={form.category}
                    onValueChange={(v) => set("category", v)}
                  >
                    <SelectTrigger className="rounded-lg">
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
                <Label className="text-xs font-medium text-muted-foreground">Tags (comma-separated)</Label>
                <Input
                  placeholder="reorder, inventory, critical"
                  value={form.tags}
                  onChange={(e) => set("tags", e.target.value)}
                  className="rounded-lg"
                />
              </div>
            </div>
          </div>

          {/* Condition */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground">Condition</h3>
            </div>
            <div className="px-5 py-4">
              <div className="flex items-end gap-3">
                <div className="flex-1 space-y-1.5" id="field-condField">
                  <Label className="text-xs font-medium text-muted-foreground">Field</Label>
                  <Select
                    value={form.condField}
                    onValueChange={(v) => set("condField", v)}
                  >
                    <SelectTrigger className="rounded-lg">
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
                  <Label className="text-xs font-medium text-muted-foreground">Operator</Label>
                  <Select
                    value={form.condOperator}
                    onValueChange={(v) => set("condOperator", v)}
                  >
                    <SelectTrigger className="rounded-lg">
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
                  <Label className="text-xs font-medium text-muted-foreground">Value</Label>
                  <Input
                    value={form.condValue}
                    onChange={(e) => set("condValue", e.target.value)}
                    className="rounded-lg"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Live Preview */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border flex items-center gap-2">
              <Eye className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">Live Preview</h3>
            </div>
            <div className="px-5 py-4">
              {previewLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Checking against your data...
                </div>
              ) : preview ? (
                <div className="space-y-3">
                  {/* Match count */}
                  <div className="flex items-center gap-2">
                    {preview.matchCount === 0 ? (
                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                    ) : (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    )}
                    <span className="text-sm font-medium text-foreground">
                      This rule currently matches{" "}
                      <strong>{preview.matchCount}</strong> of{" "}
                      <strong>{preview.totalCount}</strong> items
                    </span>
                  </div>

                  {/* Warnings */}
                  {preview.matchCount === 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
                      No items currently match this rule. The rule will still be
                      saved and will apply when conditions are met.
                    </div>
                  )}
                  {preview.totalCount > 0 &&
                    preview.matchCount === preview.totalCount && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
                        This rule matches all items. Check your threshold value.
                      </div>
                    )}

                  {/* Sample table */}
                  {preview.samples.length > 0 && (
                    <div className="overflow-x-auto rounded-lg border border-border">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-muted text-left text-muted-foreground">
                            {Object.keys(flattenSample(preview.samples[0])).map(
                              (key) => (
                                <th key={key} className="px-3 py-2 font-medium whitespace-nowrap">
                                  {key}
                                </th>
                              )
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {preview.samples.map((sample, i) => {
                            const flat = flattenSample(sample);
                            return (
                              <tr key={i} className="border-t border-border even:bg-muted/50">
                                {Object.values(flat).map((val, j) => (
                                  <td key={j} className="px-3 py-2 text-foreground">
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
                <p className="text-sm text-muted-foreground py-2">
                  Preview will appear once the condition is set.
                </p>
              )}
            </div>
          </div>

          {/* Commit message */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 space-y-2">
              <Label className="text-xs font-medium text-muted-foreground">Add a note about this rule (optional)</Label>
              <Input
                placeholder="e.g. Initial safety stock threshold"
                value={form.commitMessage}
                onChange={(e) => set("commitMessage", e.target.value)}
                className="rounded-lg"
              />
              <p className="text-xs text-muted-foreground">
                Like a git commit message — describe this version of the rule
              </p>
            </div>
          </div>

          {saveError && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm bg-red-50 border border-red-200 text-red-700">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {saveError}
            </div>
          )}
        </div>
      </div>

      {/* Bottom action bar */}
      <div
        className="shrink-0 px-4 py-3 bg-card"
        style={{ borderTop: "1px solid hsl(var(--border))" }}
      >
        <div className="max-w-2xl mx-auto flex gap-3">
          <Button onClick={handleSave} disabled={saving || !form.name.trim()} className="gap-2">
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" />
                Save Rule
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setStep("input")}
          >
            Back
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/brain")}
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
