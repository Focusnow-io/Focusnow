"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Sparkles, AlertCircle, RefreshCw } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { WidgetConfig, DataQuery, DataFilter } from "./types";
import { useAppState } from "./AppStateProvider";

export function InsightWidget({ widget }: { widget: WidgetConfig }) {
  const { getFiltersFor, getSimParamsFor, state } = useAppState();
  const listenTo = widget.interactions?.listenTo ?? [];
  const config = widget.insightConfig;

  const [markdown, setMarkdown] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounce timer ref
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Abort controller for in-flight requests
  const abortRef = useRef<AbortController | null>(null);

  // Get external filters and sim params
  const externalFilters = listenTo.length > 0 ? getFiltersFor(listenTo) : [];
  const simParams = listenTo.length > 0 ? getSimParamsFor(listenTo) : {};

  // Stable key for deps — stringified to detect changes
  const filterKey = JSON.stringify(externalFilters);
  const simKey = JSON.stringify(simParams);

  const fetchInsight = useCallback(async () => {
    if (!config) return;

    // Abort any in-flight request
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      // Merge external filters into each query
      const mergedQueries: DataQuery[] = config.queries.map((q) => {
        const parsed = JSON.parse(filterKey) as DataFilter[];
        if (!parsed.length) return q;
        return {
          ...q,
          filters: [...(q.filters ?? []), ...parsed],
        };
      });

      const res = await fetch("/api/apps/widget-insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          queries: mergedQueries,
          prompt: config.prompt,
          simParams: JSON.parse(simKey) as Record<string, unknown>,
          maxTokens: config.maxTokens,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(errData.error ?? `Request failed (${res.status})`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let fullText = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line) as { type: string; text?: string; error?: string };
            if (event.type === "text_delta" && event.text) {
              fullText += event.text;
              setMarkdown(fullText);
            } else if (event.type === "error") {
              throw new Error(event.error ?? "Stream error");
            }
          } catch (parseErr) {
            if (parseErr instanceof Error && parseErr.message === "Stream error") throw parseErr;
            continue;
          }
        }
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Failed to generate insight");
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, simKey, config?.prompt]);

  // Debounced fetch on filter/param/refresh changes
  useEffect(() => {
    if (!config) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      fetchInsight();
    }, 500);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, simKey, state.refreshKey, fetchInsight]);

  if (!config) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        No insight configuration provided.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-purple-500" />
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {widget.title}
          </p>
        </div>
        {!loading && markdown && (
          <button
            onClick={fetchInsight}
            className="p-1.5 rounded-md text-muted-foreground hover:text-muted-foreground hover:bg-muted transition-colors"
            title="Regenerate"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="px-5 py-4 min-h-[120px]">
        {error && (
          <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-3">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading && !markdown && (
          <div className="space-y-3 animate-pulse">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Analyzing data...
            </div>
            <div className="h-3 bg-muted rounded w-full" />
            <div className="h-3 bg-muted rounded w-5/6" />
            <div className="h-3 bg-muted rounded w-4/6" />
            <div className="h-3 bg-muted rounded w-full" />
            <div className="h-3 bg-muted rounded w-3/6" />
          </div>
        )}

        {markdown && (
          <div className="prose prose-sm max-w-none prose-p:text-foreground prose-headings:text-foreground prose-ul:pl-5 prose-li:text-foreground prose-strong:font-semibold prose-h3:text-sm prose-h3:mt-4 prose-h3:mb-2">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {markdown}
            </ReactMarkdown>
            {loading && (
              <span className="inline-block w-2 h-4 bg-purple-400 animate-pulse ml-0.5 align-text-bottom rounded-sm" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
