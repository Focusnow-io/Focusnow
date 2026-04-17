"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Sparkles, Send, CheckCircle, Loader2, Lightbulb } from "lucide-react";

interface VibeCodingPanelProps {
  open: boolean;
  onClose: () => void;
  appName: string;
  template: string;
  instanceId?: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

const EXAMPLE_PROMPTS: Record<string, string[]> = {
  INVENTORY_COMMAND_CENTER: [
    "Add an ABC classification breakdown chart",
    "Show only items with less than 14 days of supply",
    "Add a location filter dropdown",
    "Highlight items where value exceeds $10,000",
    "Group inventory by warehouse location",
  ],
  PROCUREMENT_HUB: [
    "Show only POs overdue by more than 7 days",
    "Add a spend-by-category breakdown chart",
    "Highlight suppliers with on-time delivery below 70%",
    "Add a lead time trend column to the scorecard",
  ],
  DEMAND_FULFILLMENT: [
    "Show only sales orders due this week",
    "Add a demand vs supply coverage chart",
    "Highlight work orders that are behind schedule",
    "Group at-risk SKUs by product category",
  ],
  DATA_CHAT: [
    "Show suggested questions for inventory management",
    "Make responses more concise",
    "Add a suggested question about reorder status",
  ],
};

const FALLBACK_PROMPTS = [
  "Highlight the most important items",
  "Add a filter for this view",
  "Show a summary metric at the top",
  "Sort by the most critical field",
];

export function VibeCodingPanel({
  open,
  onClose,
  appName,
  template,
  instanceId,
}: VibeCodingPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [appliedCount, setAppliedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const examplePrompts = EXAMPLE_PROMPTS[template] ?? FALLBACK_PROMPTS;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function handleSend(text?: string) {
    const userMsg = (text ?? prompt).trim();
    if (!userMsg || loading) return;

    setPrompt("");
    setError(null);
    const newMessages: Message[] = [...messages, { role: "user", content: userMsg }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const res = await fetch("/api/apps/vibe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages, template, instanceId }),
      });

      const data = await res.json() as { message?: string; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "Generation failed");

      setMessages((m) => [...m, { role: "assistant", content: data.message! }]);
      setAppliedCount((n) => n + 1);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong";
      setError(msg);
      setMessages((m) => [...m, { role: "assistant", content: `Sorry, I ran into an issue: ${msg}` }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[82vh] flex flex-col p-0 gap-0 overflow-hidden rounded-2xl">
        {/* Header */}
        <DialogHeader className="px-5 pt-5 pb-4 border-b border-border">
          <DialogTitle className="flex items-center gap-2 text-base">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            Customize {appName}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Tell me what to change and I&apos;ll update it. Changes persist across sessions.
          </DialogDescription>
        </DialogHeader>

        {/* Conversation */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0">
          {messages.length === 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-1.5">
                <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Try asking</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {examplePrompts.map((p) => (
                  <button
                    key={p}
                    className="text-xs bg-muted hover:bg-muted text-foreground px-2.5 py-1 rounded-full transition-colors text-left"
                    onClick={() => handleSend(p)}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={`rounded-xl px-3.5 py-2.5 text-sm ${
                msg.role === "user"
                  ? "bg-primary text-white ml-8 rounded-br-sm"
                  : "bg-muted border border-border text-foreground mr-8 rounded-bl-sm"
              }`}
            >
              {msg.role === "assistant" && (
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Sparkles className="w-3 h-3 text-muted-foreground" />
                  <span className="text-xs font-semibold text-muted-foreground">Focus AI</span>
                </div>
              )}
              <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
            </div>
          ))}

          {loading && (
            <div className="bg-muted border border-border rounded-xl rounded-bl-sm px-3.5 py-3 mr-8">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" />
                <div className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce [animation-delay:0.1s]" />
                <div className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce [animation-delay:0.2s]" />
                <span className="text-xs text-muted-foreground ml-1">Thinking…</span>
              </div>
            </div>
          )}

          {error && (
            <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Applied indicator */}
        {appliedCount > 0 && (
          <div className="px-4 py-2 border-t border-border bg-emerald-500/10">
            <p className="text-xs text-emerald-700 flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5" />
              {appliedCount} customization{appliedCount !== 1 ? "s" : ""} applied to {appName}
            </p>
          </div>
        )}

        {/* Input */}
        <div className="px-4 py-3 border-t border-border flex gap-2">
          <Textarea
            placeholder="Describe a change…"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={2}
            className="resize-none text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
            }}
          />
          <Button
            size="icon"
            onClick={() => handleSend()}
            disabled={loading || !prompt.trim()}
            className="self-end bg-primary hover:bg-primary/90 border-0"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
