"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Sparkles, ArrowUp, ArrowLeft, Save,
  Loader2, LayoutDashboard, ChevronDown, Database,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CustomAppRenderer } from "./CustomAppRenderer";
import type { CustomAppConfig } from "./widgets/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface DataSummary {
  products: number;
  inventory: number;
  suppliers: number;
  purchaseOrders: number;
  salesOrders: number;
  workOrders: number;
  lots: number;
  customers: number;
  locations: number;
  boms: number;
  forecasts: number;
  overduePOs: number;
  stockOuts: number;
}

interface Props {
  onSave: (name: string, config: CustomAppConfig) => Promise<void>;
  onBack: () => void;
  initialConfig?: CustomAppConfig;
  initialName?: string;
}

// ---------------------------------------------------------------------------
// Starter prompt generation based on user's actual data
// ---------------------------------------------------------------------------

function buildStarterPrompts(data: DataSummary | null): string[] {
  const FALLBACKS = [
    "Show inventory breakdown by category with low-stock alerts",
    "Create a procurement dashboard with PO status and supplier metrics",
    "Build a production tracker with work order progress and completion rates",
    "Show supplier performance: lead times, quality ratings, and risk levels",
    "Create a KPI summary: total orders, active suppliers, inventory value, and alerts",
    "Build an operations overview with key stats, trends, and risk indicators",
  ];

  if (!data) {
    return [
      "Build me an operations overview with key stats and alerts",
      "Show inventory breakdown by category with low-stock alerts",
      "Create a procurement dashboard with PO status and supplier metrics",
      "Build a production tracker with work order progress and completion rates",
    ];
  }

  const prompts: string[] = [];

  // Always offer overview
  prompts.push("Build me an executive overview dashboard covering all my data — KPIs, trends, and alerts");

  // Data-aware prompts
  if (data.overduePOs > 0) {
    prompts.push(`I have ${data.overduePOs} overdue POs — build a procurement risk dashboard with trends and alerts`);
  }
  if (data.stockOuts > 0) {
    prompts.push(`${data.stockOuts} items are out of stock — show inventory health with alerts and days-of-supply`);
  }
  if (data.purchaseOrders > 0 && data.suppliers > 0) {
    prompts.push("Show supplier performance: PO volumes by month, status breakdown, lead times, and overdue alerts");
  }
  if (data.workOrders > 0) {
    prompts.push("Build a production dashboard: WO status, fill rate progress, scrap rate, and completion trends");
  }
  if (data.salesOrders > 0 && data.customers > 0) {
    prompts.push("Create a sales & customer dashboard: revenue by customer, SO pipeline, monthly trends");
  } else if (data.salesOrders > 0) {
    prompts.push("Create a sales pipeline dashboard with SO status, revenue breakdown, and monthly trends");
  }
  if (data.customers > 0 && data.salesOrders === 0) {
    prompts.push("Show me a customer overview: count by country, credit analysis, and top customers");
  }
  if (data.forecasts > 0) {
    prompts.push("Build a demand planning dashboard with forecast trends and planned vs actual comparison");
  }
  if (data.inventory > 0 && data.locations > 1) {
    prompts.push("Show inventory across all locations with category breakdown and reorder alerts");
  } else if (data.inventory > 0) {
    prompts.push("Show me inventory by category with stock alerts and value breakdown");
  }
  if (data.suppliers > 0 && data.purchaseOrders === 0) {
    prompts.push("Show supplier overview: lead times, quality ratings, countries, and risk levels");
  }

  // Pad up to 4 with fallbacks if not enough data-aware prompts were generated
  for (const fallback of FALLBACKS) {
    if (prompts.length >= 4) break;
    if (!prompts.includes(fallback)) prompts.push(fallback);
  }

  return prompts.slice(0, 4);
}

// ---------------------------------------------------------------------------
// JSON extraction from streamed text
// ---------------------------------------------------------------------------

function extractConfig(text: string): CustomAppConfig | null {
  // Look for ```json ... ``` block
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
  if (!jsonMatch) return null;
  try {
    const config = JSON.parse(jsonMatch[1].trim()) as CustomAppConfig;
    if (!config.widgets?.length) return null;
    // Deduplicate widget IDs
    const seen = new Set<string>();
    config.widgets = config.widgets.map((w, i) => {
      let id = w.id || `widget-${i}`;
      if (seen.has(id)) id = `${id}-${i}`;
      seen.add(id);
      return { ...w, id };
    });
    return config;
  } catch {
    return null;
  }
}

function extractExplanation(text: string): string {
  // Everything before the ```json block
  const idx = text.indexOf("```json");
  if (idx === -1) return text;
  return text.slice(0, idx).trim();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CreateAppPanel({ onSave, onBack, initialConfig, initialName }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [generating, setGenerating] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [config, setConfig] = useState<CustomAppConfig | null>(initialConfig ?? null);
  const [appName, setAppName] = useState(initialName ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(!!initialConfig);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [dataSummary, setDataSummary] = useState<DataSummary | null>(null);
  const [dataSummaryLoaded, setDataSummaryLoaded] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Fetch data summary for smart starter prompts
  useEffect(() => {
    fetch("/api/apps/data-summary")
      .then((r) => r.ok ? r.json() : null)
      .then((d: DataSummary | null) => { if (d) setDataSummary(d); setDataSummaryLoaded(true); })
      .catch(() => { setDataSummaryLoaded(true); });
  }, []);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamText, generating, scrollToBottom]);

  function handleScroll() {
    const el = scrollAreaRef.current;
    if (!el) return;
    setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 100);
  }

  async function generate(userMsg: string) {
    if (!userMsg.trim() || generating) return;
    setError(null);

    const newMessages: Message[] = [...messages, { role: "user", content: userMsg }];
    setMessages(newMessages);
    setInput("");
    setGenerating(true);
    setStreamText("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    try {
      const res = await fetch("/api/apps/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
          currentConfig: config ?? undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: "Request failed" })) as { error?: string };
        throw new Error(errData.error ?? `HTTP ${res.status}`);
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
              setStreamText(fullText);

              // Live config extraction — update preview as soon as JSON is complete
              const liveConfig = extractConfig(fullText);
              if (liveConfig) {
                setConfig(liveConfig);
                if (!appName && liveConfig.title) setAppName(liveConfig.title);
                setShowPreview(true);
              }
            } else if (event.type === "error") {
              throw new Error(event.error ?? "Stream error");
            }
          } catch (parseErr) {
            // Skip malformed lines
            if (parseErr instanceof Error && parseErr.message !== "Stream error" && !parseErr.message.startsWith("HTTP")) {
              continue;
            }
            throw parseErr;
          }
        }
      }

      // Finalize — extract explanation for the message
      const explanation = extractExplanation(fullText);
      const finalConfig = extractConfig(fullText);

      if (finalConfig) {
        setConfig(finalConfig);
        if (!appName && finalConfig.title) setAppName(finalConfig.title);
        setShowPreview(true);
      }

      setMessages((m) => [...m, {
        role: "assistant",
        content: explanation || `Built a dashboard with ${finalConfig?.widgets.length ?? 0} widgets.`,
      }]);
      setStreamText("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong";
      setError(msg);
      setMessages((m) => [...m, { role: "assistant", content: `Sorry, I hit an error: ${msg}` }]);
      setStreamText("");
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave() {
    if (!config || !appName.trim()) return;
    setSaving(true);
    try {
      await onSave(appName.trim(), config);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save app");
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      generate(input);
    }
  }

  function handleTextareaChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  const isEmpty = messages.length === 0 && !generating;
  const starterPrompts = buildStarterPrompts(dataSummary);

  // Extract live explanation while streaming
  const liveExplanation = streamText ? extractExplanation(streamText) : "";

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 shrink-0 h-12" style={{ borderBottom: "1px solid #e8e8e8" }}>
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gray-900 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Build with AI</p>
              <p className="text-xs text-gray-400">Describe what you want to see</p>
            </div>
          </div>
        </div>

        {config && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPreview((p) => !p)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              {showPreview ? "Hide preview" : "Show preview"}
            </button>
            <Button size="sm" onClick={handleSave} disabled={saving || !appName.trim()} className="gap-1.5 text-xs h-8 bg-gray-900 hover:bg-gray-800 border-0">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save app
            </Button>
          </div>
        )}
      </div>

      {/* Main area */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Chat pane */}
        <div className={`flex flex-col ${showPreview && config ? "w-[420px] shrink-0 border-r border-gray-100" : "flex-1"}`}>
          {/* Messages */}
          <div
            ref={scrollAreaRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto py-6"
          >
            <div className="max-w-3xl mx-auto px-4">
              {isEmpty && (
                <div className="flex flex-col items-center justify-center h-full min-h-[60vh] gap-6 text-center">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900">What should your app show?</h2>
                    <p className="text-sm text-gray-500 mt-1.5 max-w-md mx-auto">
                      Describe the dashboard you have in mind. I&apos;ll build it from your live data.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-xl">
                    {dataSummaryLoaded && starterPrompts.map((p) => (
                      <button
                        key={p}
                        onClick={() => generate(p)}
                        className="text-left text-sm text-gray-700 bg-white hover:bg-gray-50 border border-gray-200 hover:border-gray-300 rounded-xl px-4 py-3 transition-colors"
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-6">
                {messages.map((msg, i) => (
                  <div key={i}>
                    {msg.role === "user" ? (
                      <div className="flex justify-end">
                        <div className="max-w-[72%] bg-gray-900 text-white rounded-2xl rounded-br-sm px-4 py-3 text-sm leading-relaxed">
                          {msg.content}
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
                        {msg.content}
                      </div>
                    )}
                  </div>
                ))}

                {/* Streaming indicator with live explanation */}
                {generating && (
                  <div className="space-y-2">
                    {liveExplanation ? (
                      <div className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
                        {liveExplanation}
                        <span className="inline-block w-0.5 h-4 bg-gray-400 animate-pulse ml-0.5 align-text-bottom" />
                      </div>
                    ) : (
                      <div className="flex gap-1 items-center py-2">
                        <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce [animation-delay:0ms]" />
                        <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce [animation-delay:150ms]" />
                        <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce [animation-delay:300ms]" />
                        <span className="text-xs text-gray-400 ml-1">Designing your dashboard…</span>
                      </div>
                    )}
                  </div>
                )}

                {error && (
                  <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
                )}
              </div>

              <div ref={bottomRef} />
            </div>
          </div>

          {/* App name + input */}
          <div className="shrink-0 px-4 pb-3 pt-1 relative">
            {showScrollBtn && (
              <div className="absolute -top-12 left-1/2 -translate-x-1/2 z-10">
                <button
                  onClick={scrollToBottom}
                  className="w-8 h-8 rounded-full border border-gray-200 bg-white shadow-md flex items-center justify-center text-gray-500 hover:text-gray-700 hover:shadow-lg transition-all"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>
            )}

            <div className="max-w-3xl mx-auto">
              {config && (
                <input
                  type="text"
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  placeholder="App name…"
                  className="w-full text-sm font-medium text-gray-900 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 mb-2 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-gray-400"
                />
              )}

              <div className="rounded-2xl border-2 border-blue-400 bg-white shadow-sm focus-within:border-blue-500 transition-colors">
                <textarea
                  ref={textareaRef}
                  rows={1}
                  value={input}
                  onChange={handleTextareaChange}
                  placeholder={config ? "Refine your dashboard… (e.g. add a chart, change filters)" : "Describe your dashboard…"}
                  onKeyDown={handleKeyDown}
                  disabled={generating}
                  className="w-full px-4 pt-4 pb-2 text-sm bg-transparent resize-none focus:outline-none placeholder:text-gray-400 disabled:opacity-60 text-gray-900 leading-relaxed"
                  style={{ minHeight: "44px", maxHeight: "160px" }}
                />
                <div className="flex items-center justify-between px-4 pb-3">
                  <span className="flex items-center gap-1.5 text-xs text-gray-400">
                    <Database className="w-3.5 h-3.5" />
                    Live data
                  </span>
                  <button
                    onClick={() => generate(input)}
                    disabled={generating || !input.trim()}
                    className="w-8 h-8 rounded-full bg-blue-500 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                  >
                    {generating ? (
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

        {/* Preview pane */}
        {showPreview && config && (
          <div className="flex-1 overflow-y-auto p-6 bg-gray-50/50">
            <CustomAppRenderer config={config} />
          </div>
        )}
      </div>
    </div>
  );
}
