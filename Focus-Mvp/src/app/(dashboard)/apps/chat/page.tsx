"use client";

import { useState, useRef, useEffect, useCallback, FormEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  AlertTriangle,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Database,
  Loader2,
  MessageSquare,
  Plus,
  Search,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Conversation {
  id: string;
  title: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
  lastMessage: string | null;
  lastMessageRole: string | null;
}

interface ToolCallEvent {
  name: string;
  id: string;
  result?: string;
}

interface Message {
  id?: string;
  role: "user" | "assistant" | "tool";
  content: string;
  toolCalls?: ToolCallEvent[];
  model?: string;
}

import { useOnboardingStage } from "@/components/onboarding/useOnboardingStage";

// ---------------------------------------------------------------------------
// Suggested questions (fallback when no rules exist)
// ---------------------------------------------------------------------------

const DEFAULT_SUGGESTED_QUESTIONS = [
  "Which products are below their reorder point?",
  "Show me a summary of my current stock levels",
  "What purchase orders are overdue?",
  "Trace lot number L-001 through the supply chain",
  "How many open NCRs do we have by severity?",
  "What's our total inventory value?",
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

// TODO: role-based chat access

export default function ChatPage() {
  // Conversation list
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [sidebarSearch, setSidebarSearch] = useState("");

  // Messages
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Tool calls in progress
  const [activeToolCalls, setActiveToolCalls] = useState<Map<string, ToolCallEvent>>(new Map());

  // Onboarding — seeded questions from user's rules
  const { data: onboardingData, stage: onboardingStage } = useOnboardingStage();
  const suggestedQuestions =
    onboardingData?.suggestedQuestions && onboardingData.suggestedQuestions.length > 0
      ? onboardingData.suggestedQuestions
      : DEFAULT_SUGGESTED_QUESTIONS;

  // Usage warning
  const [usageWarning, setUsageWarning] = useState<{
    level: "warning" | "critical" | "blocked";
    percentage: number;
    resetAt: string;
  } | null>(null);

  useEffect(() => {
    let mounted = true;
    async function checkUsage() {
      try {
        const res = await fetch("/api/usage");
        if (!res.ok || !mounted) return;
        const data = await res.json();
        const pct = Math.max(data.daily.percentage, data.weekly.percentage);
        if (pct >= 100) {
          setUsageWarning({ level: "blocked", percentage: pct, resetAt: data.daily.percentage >= 100 ? data.daily.resetAt : data.weekly.resetAt });
        } else if (pct >= 90) {
          setUsageWarning({ level: "critical", percentage: pct, resetAt: data.daily.resetAt });
        } else if (pct >= 80) {
          setUsageWarning({ level: "warning", percentage: pct, resetAt: data.daily.resetAt });
        } else {
          setUsageWarning(null);
        }
      } catch { /* non-critical */ }
    }
    checkUsage();
    const interval = setInterval(checkUsage, 60_000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  // Scroll
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Data fetching ────────────────────────────────────────────────────────

  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/conversations");
      if (!res.ok) return;
      const data = await res.json();
      setConversations(data.conversations ?? []);
    } catch {
      // silent fail
    }
  }, []);

  const loadMessages = useCallback(async (conversationId: string) => {
    try {
      const res = await fetch(`/api/chat/conversations/${conversationId}/messages`);
      if (!res.ok) return;
      const data = await res.json();
      setMessages(
        (data.messages ?? []).map((m: { id: string; role: string; content: string; toolCalls?: unknown; model?: string }) => ({
          id: m.id,
          role: m.role.toLowerCase() as Message["role"],
          content: m.content,
          toolCalls: m.toolCalls as ToolCallEvent[] | undefined,
          model: m.model ?? undefined,
        }))
      );
    } catch {
      // silent fail
    }
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (activeConversationId && !isLoading) {
      loadMessages(activeConversationId);
    } else if (!activeConversationId) {
      setMessages([]);
    }
  }, [activeConversationId, loadMessages, isLoading]);

  // ── Scrolling ────────────────────────────────────────────────────────────

  function scrollToBottom(smooth = true) {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "instant" });
  }

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  function handleScroll() {
    const el = scrollAreaRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollBtn(distFromBottom > 120);
  }

  // ── Conversation management ──────────────────────────────────────────────

  async function createConversation(): Promise<string | null> {
    setIsCreating(true);
    try {
      const res = await fetch("/api/chat/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) return null;
      const data = await res.json();
      await loadConversations();
      return data.id;
    } catch {
      return null;
    } finally {
      setIsCreating(false);
    }
  }

  async function handleNewConversation() {
    const id = await createConversation();
    if (id) {
      setActiveConversationId(id);
      setMessages([]);
    }
  }

  function selectConversation(id: string) {
    if (id === activeConversationId) return;
    setActiveConversationId(id);
    setActiveToolCalls(new Map());
  }

  // ── Send message ─────────────────────────────────────────────────────────

  async function sendMessage(content: string) {
    if (!content.trim() || isLoading) return;

    let conversationId = activeConversationId;

    // Auto-create conversation if none selected
    if (!conversationId) {
      conversationId = await createConversation();
      if (!conversationId) return;
      setActiveConversationId(conversationId);
    }

    const userMessage: Message = { role: "user", content: content.trim() };
    setMessages((prev) => [...prev, userMessage, { role: "assistant", content: "" }]);
    setInput("");
    setIsLoading(true);
    setActiveToolCalls(new Map());
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120_000); // 2 min — allows for API retries + tool call loops

      const response = await fetch(
        `/api/chat/conversations/${conversationId}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: content.trim() }),
          signal: controller.signal,
        }
      );

      clearTimeout(timeout);

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Request failed" }));
        throw new Error(err.error ?? "Request failed");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";
      let receivedAnyContent = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Process newline-delimited JSON events
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? ""; // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            handleStreamEvent(event);
            receivedAnyContent = true;
          } catch (parseErr) {
            console.error("[Chat] Failed to parse stream event:", line, parseErr);
          }
        }
      }

      // Process any remaining buffer
      if (buffer.trim()) {
        try {
          handleStreamEvent(JSON.parse(buffer));
          receivedAnyContent = true;
        } catch (parseErr) {
          console.error("[Chat] Failed to parse final buffer:", buffer, parseErr);
        }
      }

      // If the stream completed but we never got any content, show a fallback
      if (!receivedAnyContent) {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant" && !last.content) {
            return [
              ...prev.slice(0, -1),
              { ...last, content: "No response received. Please try again." },
            ];
          }
          return prev;
        });
      }

      // Refresh conversation list to update titles/timestamps
      loadConversations();
    } catch (err) {
      const msg =
        err instanceof DOMException && err.name === "AbortError"
          ? "Request timed out. The server took too long to respond."
          : err instanceof Error
            ? err.message
            : "Something went wrong.";
      console.error("[Chat] sendMessage error:", err);
      setMessages((prev) => [
        ...prev.slice(0, -1),
        { role: "assistant", content: msg },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  function handleStreamEvent(event: { type: string; content?: string; name?: string; id?: string; result?: string; message?: string; model?: string }) {
    switch (event.type) {
      case "text":
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          return [
            ...prev.slice(0, -1),
            { ...last, content: last.content + (event.content ?? "") },
          ];
        });
        break;

      case "tool_call":
        if (event.name && event.id) {
          setActiveToolCalls((prev) => {
            const next = new Map(prev);
            next.set(event.id!, { name: event.name!, id: event.id! });
            return next;
          });
        }
        break;

      case "tool_result":
        if (event.id) {
          setActiveToolCalls((prev) => {
            const next = new Map(prev);
            const existing = next.get(event.id!);
            if (existing) {
              next.set(event.id!, { ...existing, result: event.result });
            }
            return next;
          });
          // Also attach to the current assistant message
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            const toolCalls = [...(last.toolCalls ?? [])];
            const existingIdx = toolCalls.findIndex((tc) => tc.id === event.id);
            if (existingIdx >= 0) {
              toolCalls[existingIdx] = { ...toolCalls[existingIdx], result: event.result };
            } else {
              toolCalls.push({
                name: event.name ?? "tool",
                id: event.id!,
                result: event.result,
              });
            }
            return [
              ...prev.slice(0, -1),
              { ...last, toolCalls },
            ];
          });
        }
        break;

      case "done":
        if (event.model) {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            return [...prev.slice(0, -1), { ...last, model: event.model }];
          });
        }
        break;

      case "error":
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          return [
            ...prev.slice(0, -1),
            { ...last, content: last.content + `\n\n**Error:** ${event.message}` },
          ];
        });
        break;
    }
  }

  // ── Form handlers ────────────────────────────────────────────────────────

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    sendMessage(input);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  function handleTextareaChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  // ── Filtered conversations ──────────────────────────────────────────────

  const filteredConversations = sidebarSearch
    ? conversations.filter((c) =>
        c.title.toLowerCase().includes(sidebarSearch.toLowerCase())
      )
    : conversations;

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex -m-6 h-[calc(100vh-3.25rem)]">
      {/* Sidebar — conversation list */}
      <div
        className="w-[280px] shrink-0 flex flex-col bg-white overflow-hidden"
        style={{ borderRight: "1px solid #e8e8e8" }}
      >
        {/* Sidebar header */}
        <div className="p-3 space-y-2" style={{ borderBottom: "1px solid #e8e8e8" }}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">AI Chat</h2>
            <button
              onClick={handleNewConversation}
              disabled={isCreating}
              className="w-7 h-7 rounded-md flex items-center justify-center text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors disabled:opacity-40"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search conversations…"
              value={sidebarSearch}
              onChange={(e) => setSidebarSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:border-gray-300 text-gray-700 placeholder:text-gray-400"
            />
          </div>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {filteredConversations.length === 0 ? (
            <div className="p-4 text-center">
              <MessageSquare className="w-8 h-8 mx-auto text-gray-300 mb-2" />
              <p className="text-xs text-gray-400">
                {conversations.length === 0
                  ? "No conversations yet"
                  : "No matching conversations"}
              </p>
            </div>
          ) : (
            <div className="py-1">
              {filteredConversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => selectConversation(conv.id)}
                  className={`w-full text-left px-3 py-2.5 transition-colors ${
                    conv.id === activeConversationId
                      ? "bg-gray-100"
                      : "hover:bg-gray-50"
                  }`}
                >
                  <p className="text-[13px] font-medium text-gray-900 truncate">
                    {conv.title}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] text-gray-400">
                      {new Date(conv.updatedAt).toLocaleDateString()}
                    </span>
                    {conv.lastMessage && (
                      <span className="text-[11px] text-gray-400 truncate flex-1">
                        {conv.lastMessage.slice(0, 50)}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Chat header */}
        <div
          className="h-12 px-4 flex items-center gap-2 shrink-0 bg-white"
          style={{ borderBottom: "1px solid #e8e8e8" }}
        >
          <MessageSquare className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-medium text-gray-700 truncate">
            {activeConversationId
              ? conversations.find((c) => c.id === activeConversationId)?.title ?? "Chat"
              : "AI Chat"}
          </span>
        </div>

        {/* Messages area */}
        <div
          ref={scrollAreaRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto py-6"
        >
          <div className="max-w-3xl mx-auto px-4">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full min-h-[60vh] gap-6 text-center">
                <div>
                  {onboardingStage === "aha" && onboardingData?.firstRule ? (
                    <>
                      <h2 className="text-xl font-semibold text-gray-900">
                        Your Brain has {onboardingData.firstRule.name ? "1" : "a"} rule. Try asking something it covers.
                      </h2>
                      <p className="text-sm text-gray-500 mt-1.5 max-w-md">
                        Focus will use your rule as context. The answer will be specific to how your business works — not generic.
                      </p>
                    </>
                  ) : onboardingStage === "capture" || onboardingStage === "import" ? (
                    <>
                      <h2 className="text-xl font-semibold text-gray-900">
                        Ask about your data
                      </h2>
                      <p className="text-sm text-gray-500 mt-1.5 max-w-md">
                        Add a rule first — then Focus can give you grounded answers specific to how your business works.
                      </p>
                    </>
                  ) : (
                    <>
                      <h2 className="text-xl font-semibold text-gray-900">
                        Ask about your data
                      </h2>
                      <p className="text-sm text-gray-500 mt-1.5 max-w-md">
                        I have access to your complete operational dataset — inventory, orders, BOMs, quality records, and more. Ask me anything.
                      </p>
                    </>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-xl">
                  {suggestedQuestions.map((q) => (
                    <button
                      key={q}
                      onClick={() => sendMessage(q)}
                      className="text-left px-4 py-3 rounded-xl border border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50 text-sm text-gray-700 transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {messages.map((message, i) => (
                  <div key={message.id ?? i}>
                    {message.role === "user" ? (
                      <div className="flex justify-end">
                        <div dir="auto" className="max-w-[72%] bg-gray-900 text-white rounded-2xl rounded-br-sm px-4 py-3 text-sm leading-relaxed">
                          {message.content}
                        </div>
                      </div>
                    ) : (
                      <div className="w-full">
                        {/* Tool calls */}
                        {message.toolCalls && message.toolCalls.length > 0 && (
                          <div className="mb-3 space-y-1.5">
                            {message.toolCalls.map((tc) => (
                              <ToolCallBlock key={tc.id} toolCall={tc} />
                            ))}
                          </div>
                        )}

                        {/* Assistant text */}
                        {message.content === "" && !message.toolCalls?.length ? (
                          <div className="flex gap-1 items-center py-2">
                            <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce [animation-delay:0ms]" />
                            <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce [animation-delay:150ms]" />
                            <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce [animation-delay:300ms]" />
                          </div>
                        ) : message.content ? (
                          <div dir="auto" className="prose prose-base max-w-none
                            prose-headings:font-bold prose-headings:text-gray-900 prose-headings:tracking-tight
                            prose-h1:text-2xl prose-h1:mt-2 prose-h1:mb-3
                            prose-h2:text-lg prose-h2:mt-6 prose-h2:mb-2
                            prose-h3:text-base prose-h3:mt-4 prose-h3:mb-1
                            prose-p:text-gray-800 prose-p:leading-relaxed prose-p:my-2
                            prose-ul:pl-5 prose-ul:my-2 prose-li:text-gray-800 prose-li:my-1
                            prose-ol:pl-5 prose-ol:my-2
                            prose-strong:text-gray-900 prose-strong:font-semibold
                            prose-code:text-gray-700 prose-code:bg-gray-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm
                            prose-hr:my-4 prose-hr:border-gray-200">
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              components={{
                                table: ({ children }) => (
                                  <div className="overflow-x-auto my-3">
                                    <table className="min-w-full text-sm border-collapse border border-gray-200 rounded-lg overflow-hidden">
                                      {children}
                                    </table>
                                  </div>
                                ),
                                thead: ({ children }) => (
                                  <thead className="bg-gray-50">{children}</thead>
                                ),
                                th: ({ children }) => (
                                  <th className="px-3 py-2 text-start font-semibold text-gray-700 border border-gray-200 whitespace-nowrap text-xs">
                                    {children}
                                  </th>
                                ),
                                td: ({ children }) => (
                                  <td className="px-3 py-2 border border-gray-100 text-gray-800">
                                    {children}
                                  </td>
                                ),
                                tr: ({ children }) => (
                                  <tr className="even:bg-gray-50/60">{children}</tr>
                                ),
                              }}
                            >
                              {message.content}
                            </ReactMarkdown>
                          </div>
                        ) : null}

                        {/* Streaming cursor */}
                        {isLoading && i === messages.length - 1 && (
                          <span className="inline-block w-0.5 h-4 bg-gray-400 animate-pulse ml-0.5 align-text-bottom" />
                        )}
                      </div>
                    )}
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </div>

        {/* Input area */}
        <div className="shrink-0 px-4 pb-3 pt-1 relative">
          {showScrollBtn && (
            <div className="absolute -top-12 left-1/2 -translate-x-1/2 z-10">
              <button
                onClick={() => scrollToBottom()}
                className="w-8 h-8 rounded-full border border-gray-200 bg-white shadow-md flex items-center justify-center text-gray-500 hover:text-gray-700 hover:shadow-lg transition-all"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
            {/* Usage warning banner */}
            {usageWarning && (
              <div className={`flex items-center gap-2 px-4 py-2 mb-2 rounded-lg text-sm ${
                usageWarning.level === "blocked"
                  ? "bg-red-50 text-red-700 border border-red-200"
                  : usageWarning.level === "critical"
                    ? "bg-red-50 text-red-600 border border-red-100"
                    : "bg-amber-50 text-amber-700 border border-amber-200"
              }`}>
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>
                  {usageWarning.level === "blocked"
                    ? `You've reached your daily AI limit. Resets at midnight UTC.`
                    : usageWarning.level === "critical"
                      ? `You're almost at your daily AI limit (${usageWarning.percentage}% used).`
                      : `You're approaching your daily AI limit (${usageWarning.percentage}% used).`
                  }
                </span>
              </div>
            )}
            <div className="rounded-2xl border-2 border-blue-400 bg-white shadow-sm focus-within:border-blue-500 transition-colors">
              <textarea
                ref={textareaRef}
                rows={1}
                placeholder="Ask about your inventory, orders, suppliers…"
                value={input}
                onChange={handleTextareaChange}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
                dir="auto"
                className="w-full px-4 pt-4 pb-2 text-sm bg-transparent resize-none focus:outline-none placeholder:text-gray-400 disabled:opacity-60 text-gray-900 leading-relaxed"
                style={{ minHeight: "44px", maxHeight: "160px" }}
              />
              <div className="flex items-center justify-between px-4 pb-3">
                <span className="flex items-center gap-1.5 text-xs text-gray-400">
                  <Database className="w-3.5 h-3.5" />
                  Live data
                </span>
                <button
                  type="submit"
                  disabled={!input.trim() || isLoading || usageWarning?.level === "blocked"}
                  className="w-8 h-8 rounded-full bg-blue-500 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                >
                  {isLoading ? (
                    <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
                  ) : (
                    <ArrowUp className="w-3.5 h-3.5 text-white" />
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tool call display component
// ---------------------------------------------------------------------------

function ToolCallBlock({ toolCall }: { toolCall: ToolCallEvent }) {
  const [expanded, setExpanded] = useState(false);

  const toolLabel: Record<string, string> = {
    query_records: "Queried records",
    aggregate_records: "Aggregated data",
    get_traceability: "Traced supply chain",
    get_entity_by_id: "Looked up record",
  };

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-500 hover:bg-gray-50 transition-colors"
      >
        <Database className="w-3 h-3 text-gray-400" />
        <span className="font-medium">
          {toolLabel[toolCall.name] ?? `Called ${toolCall.name}`}
        </span>
        <ChevronRight
          className={`w-3 h-3 ml-auto transition-transform ${expanded ? "rotate-90" : ""}`}
        />
      </button>
      {expanded && toolCall.result && (
        <div className="px-3 pb-3 border-t border-gray-100">
          <pre className="text-[11px] text-gray-600 mt-2 overflow-x-auto whitespace-pre-wrap max-h-60 overflow-y-auto bg-gray-50 rounded p-2">
            {toolCall.result}
          </pre>
        </div>
      )}
    </div>
  );
}
