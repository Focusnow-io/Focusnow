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

  // Cache key per widget so each insight widget has its own cache
  const cacheKey = `insight_cache_${widget.id}`;

  const [markdown, setMarkdown] = useState(() => {
    try { return localStorage.getItem(cacheKey) ?? ""; } catch { return ""; }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Track whether the user has triggered at least one fetch (or loaded from cache)
  const [hasGenerated, setHasGenerated] = useState(() => {
    try { return !!localStorage.getItem(cacheKey); } catch { return false; }
  });
  // Track the filter/param state at last fetch to detect real changes
  const lastFetchKeyRef = useRef<string | null>(null);

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

  const fetchInsight = useCallback(async (manual = false) => {
    if (!config) return;
    if (!manual && !hasGenerated) return;

    // Abort any in-flight request
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    setHasGenerated(true);
    lastFetchKeyRef.current = filterKey + simKey;

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

      setMarkdown("");
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
      // Persist to cache
      if (fullText) {
        try { localStorage.setItem(cacheKey, fullText); } catch { /* ignore */ }
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Failed to generate insight");
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, simKey, config?.prompt, hasGenerated]);

  // Auto-refresh when filters/params change — but only if the user has already generated once
  useEffect(() => {
    if (!config || !hasGenerated) return;
    // Skip if the filter+sim key hasn't actually changed since last fetch
    const currentKey = filterKey + simKey;
    if (lastFetchKeyRef.current === currentKey) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      fetchInsight();
    }, 500);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, simKey, state.refreshKey]);

  if (!config) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-400">
        No insight configuration provided.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-purple-500" />
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            {widget.title}
          </p>
        </div>
        {!loading && markdown && (
          <button
            onClick={() => fetchInsight(true)}
            className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
            title="Regenerate"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="px-5 py-4 min-h-[120px]">
        {!hasGenerated && !loading && (
          <div className="flex flex-col items-center justify-center gap-3 py-6">
            <Sparkles className="w-6 h-6 text-purple-300" />
            <p className="text-sm text-gray-400 text-center">Click to generate an AI analysis of your data</p>
            <button
              onClick={() => fetchInsight(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-purple-500 hover:bg-purple-600 rounded-lg transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Generate insight
            </button>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-3">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading && !markdown && (
          <div className="space-y-3 animate-pulse">
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              Analyzing data...
            </div>
            <div className="h-3 bg-gray-100 rounded w-full" />
            <div className="h-3 bg-gray-100 rounded w-5/6" />
            <div className="h-3 bg-gray-100 rounded w-4/6" />
            <div className="h-3 bg-gray-100 rounded w-full" />
            <div className="h-3 bg-gray-100 rounded w-3/6" />
          </div>
        )}

        {markdown && (
          <div className="prose prose-sm max-w-none prose-p:text-gray-800 prose-headings:text-gray-900 prose-ul:pl-5 prose-li:text-gray-800 prose-strong:font-semibold prose-h3:text-sm prose-h3:mt-4 prose-h3:mb-2">
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
