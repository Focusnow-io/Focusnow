"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Package, ShoppingCart, Truck, MessageSquare,
  Search, Sparkles, Plus, LayoutDashboard, ArrowRight,
  DollarSign, ShieldCheck, ClipboardList, TrendingUp,
  Factory, AlertTriangle, Bot, Boxes, Clock, Star, Trash2, MoreHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreateAppPanel } from "@/components/apps/CreateAppPanel";
import type { CustomAppConfig } from "@/components/apps/widgets/types";

// ─── Template definitions ────────────────────────────────────────────────────

interface TemplateDefinition {
  id: string;
  name: string;
  description: string;
  href: string;
  tags: string[];
  PrimaryIcon: React.ComponentType<{ className?: string }>;
  SecondaryIcon: React.ComponentType<{ className?: string }>;
  AccentIcon: React.ComponentType<{ className?: string }>;
  gradient: string;
}

const TEMPLATES: TemplateDefinition[] = [
  {
    id: "INVENTORY_COMMAND_CENTER",
    name: "Inventory Command Center",
    description: "Complete visibility into inventory health, value, risk, and reorder needs across all SKUs.",
    href: "/apps/inventory",
    tags: ["Inventory", "Risk", "Value"],
    PrimaryIcon: Package,
    SecondaryIcon: DollarSign,
    AccentIcon: ShieldCheck,
    gradient: "from-blue-500 to-blue-700",
  },
  {
    id: "PROCUREMENT_HUB",
    name: "Procurement Hub",
    description: "Purchase order pipeline, supplier scorecard, and spend analytics in one view.",
    href: "/apps/procurement",
    tags: ["Procurement", "Suppliers", "POs"],
    PrimaryIcon: Truck,
    SecondaryIcon: ClipboardList,
    AccentIcon: TrendingUp,
    gradient: "from-emerald-500 to-teal-600",
  },
  {
    id: "DEMAND_FULFILLMENT",
    name: "Demand & Fulfillment",
    description: "Sales order tracking, production progress, and demand coverage to prevent stockouts.",
    href: "/apps/demand",
    tags: ["Sales", "Production", "Demand"],
    PrimaryIcon: ShoppingCart,
    SecondaryIcon: Factory,
    AccentIcon: AlertTriangle,
    gradient: "from-amber-500 to-orange-600",
  },
  {
    id: "DATA_CHAT",
    name: "Data Chat",
    description: "Ask any question about your inventory, orders, or suppliers in plain English.",
    href: "/apps/chat",
    tags: ["AI", "Claude", "Chat"],
    PrimaryIcon: MessageSquare,
    SecondaryIcon: Bot,
    AccentIcon: Boxes,
    gradient: "from-sky-500 to-blue-600",
  },
];

// ─── Types ───────────────────────────────────────────────────────────────────

interface AppInstance {
  id: string;
  template: string;
  name: string;
  description: string | null;
  config: Record<string, unknown> | null;
  pinned: boolean;
  createdAt: string;
}

// ─── Subcomponents ───────────────────────────────────────────────────────────

// Per-template illustration config for rich visuals
const ILLUSTRATION_STYLES: Record<string, {
  bg: string;
  accent1: string;
  accent2: string;
  blob1: string;
  blob2: string;
  floatColor: string;
}> = {
  INVENTORY_COMMAND_CENTER: {
    bg: "linear-gradient(135deg, #a8c8f0 0%, #7ab0e8 40%, #5a9be0 100%)",
    accent1: "rgba(59, 130, 246, 0.15)",
    accent2: "rgba(147, 197, 253, 0.3)",
    blob1: "rgba(37, 99, 235, 0.12)",
    blob2: "rgba(191, 219, 254, 0.4)",
    floatColor: "rgba(30, 64, 175, 0.08)",
  },
  PROCUREMENT_HUB: {
    bg: "linear-gradient(135deg, #a7f3d0 0%, #6ee7b7 40%, #34d399 100%)",
    accent1: "rgba(16, 185, 129, 0.15)",
    accent2: "rgba(167, 243, 208, 0.3)",
    blob1: "rgba(5, 150, 105, 0.12)",
    blob2: "rgba(209, 250, 229, 0.4)",
    floatColor: "rgba(6, 95, 70, 0.08)",
  },
  DEMAND_FULFILLMENT: {
    bg: "linear-gradient(135deg, #fde68a 0%, #fbbf24 40%, #f59e0b 100%)",
    accent1: "rgba(245, 158, 11, 0.15)",
    accent2: "rgba(253, 230, 138, 0.3)",
    blob1: "rgba(217, 119, 6, 0.12)",
    blob2: "rgba(254, 243, 199, 0.4)",
    floatColor: "rgba(146, 64, 14, 0.08)",
  },
  DATA_CHAT: {
    bg: "linear-gradient(135deg, #bae6fd 0%, #7dd3fc 40%, #38bdf8 100%)",
    accent1: "rgba(14, 165, 233, 0.15)",
    accent2: "rgba(186, 230, 253, 0.3)",
    blob1: "rgba(2, 132, 199, 0.12)",
    blob2: "rgba(224, 242, 254, 0.4)",
    floatColor: "rgba(12, 74, 110, 0.08)",
  },
};

function TemplateCard({
  template,
  isOwned,
  onClick,
}: {
  template: TemplateDefinition;
  isOwned: boolean;
  onClick: () => void;
}) {
  const { PrimaryIcon, SecondaryIcon, AccentIcon } = template;
  const style = ILLUSTRATION_STYLES[template.id] ?? ILLUSTRATION_STYLES.INVENTORY_COMMAND_CENTER;

  return (
    <div
      onClick={onClick}
      className="group rounded-xl overflow-hidden border border-border bg-card hover:border-[hsl(var(--primary)/0.3)] hover:shadow-[0_8px_30px_hsl(var(--primary)/0.12)] transition-all duration-300 cursor-pointer"
    >
      {/* Rich illustration area */}
      <div
        className="relative h-44 overflow-hidden"
        style={{ background: style.bg }}
      >
        {/* Dot pattern overlay */}
        <div className="absolute inset-0 opacity-[0.12]" style={{
          backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)",
          backgroundSize: "18px 18px",
        }} />

        {/* Large decorative blobs */}
        <div
          className="absolute -top-8 -right-8 w-40 h-40 rounded-full blur-2xl"
          style={{ background: style.blob2 }}
        />
        <div
          className="absolute -bottom-10 -left-6 w-48 h-48 rounded-full blur-3xl"
          style={{ background: style.blob1 }}
        />
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-56 h-56 rounded-full blur-3xl opacity-40"
          style={{ background: style.accent2 }}
        />

        {/* Floating geometric shapes */}
        <div
          className="absolute top-4 left-5 w-8 h-8 rounded-md rotate-12 group-hover:rotate-[20deg] transition-transform duration-500"
          style={{ background: style.floatColor }}
        />
        <div
          className="absolute bottom-6 right-8 w-6 h-6 rounded-full group-hover:scale-110 transition-transform duration-500"
          style={{ background: style.floatColor }}
        />
        <div
          className="absolute top-8 right-12 w-4 h-4 rounded-sm rotate-45 group-hover:rotate-[60deg] transition-transform duration-500"
          style={{ background: style.floatColor }}
        />

        {/* Main composition — central icon cluster */}
        <div className="absolute inset-0 flex items-center justify-center z-10">
          {/* Back-left card */}
          <div className="absolute left-[15%] top-[22%] w-12 h-12 rounded-xl bg-white/70 backdrop-blur-sm border border-white/50 shadow-lg flex items-center justify-center -rotate-6 group-hover:-rotate-3 group-hover:-translate-y-1 transition-all duration-300">
            <SecondaryIcon className="w-5 h-5 text-gray-600" />
          </div>

          {/* Central hero icon */}
          <div className={`relative w-[72px] h-[72px] rounded-2xl bg-gradient-to-br ${template.gradient} flex items-center justify-center shadow-xl group-hover:scale-110 group-hover:-translate-y-1 transition-all duration-300`}>
            <div className="absolute inset-0 rounded-2xl bg-white/10" />
            <PrimaryIcon className="w-8 h-8 text-white relative z-10" />
          </div>

          {/* Back-right card */}
          <div className="absolute right-[15%] bottom-[20%] w-12 h-12 rounded-xl bg-white/70 backdrop-blur-sm border border-white/50 shadow-lg flex items-center justify-center rotate-6 group-hover:rotate-3 group-hover:translate-y-1 transition-all duration-300">
            <AccentIcon className="w-5 h-5 text-gray-600" />
          </div>

          {/* Small floating accent badges */}
          <div className="absolute right-[22%] top-[18%] w-8 h-8 rounded-lg bg-white/60 backdrop-blur-sm border border-white/40 shadow-md flex items-center justify-center group-hover:-translate-y-1.5 transition-transform duration-300">
            <div className={`w-3 h-3 rounded-full bg-gradient-to-br ${template.gradient}`} />
          </div>
          <div className="absolute left-[20%] bottom-[16%] w-7 h-7 rounded-full bg-white/50 backdrop-blur-sm border border-white/30 shadow-md flex items-center justify-center group-hover:translate-y-1 transition-transform duration-300">
            <div className={`w-2.5 h-2.5 rounded-sm rotate-45 bg-gradient-to-br ${template.gradient}`} />
          </div>
        </div>

        {/* Subtle connecting lines */}
        <svg className="absolute inset-0 w-full h-full z-[5] opacity-[0.08]" preserveAspectRatio="none">
          <line x1="25%" y1="35%" x2="50%" y2="50%" stroke="white" strokeWidth="1.5" />
          <line x1="75%" y1="65%" x2="50%" y2="50%" stroke="white" strokeWidth="1.5" />
        </svg>
      </div>

      {/* Info */}
      <div className="px-4 pt-3.5 pb-4 space-y-2.5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-foreground">{template.name}</p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{template.description}</p>
          </div>
          {isOwned && (
            <span className="shrink-0 mt-0.5 text-xs font-medium bg-[hsl(var(--primary)/0.08)] text-[hsl(var(--primary))] border border-[hsl(var(--primary)/0.15)] px-2 py-0.5 rounded-full">
              Open
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {template.tags.map((tag) => (
            <span key={tag} className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-md">
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function CustomAppCard({
  instance,
  onOpen,
  onDelete,
}: {
  instance: AppInstance;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const cfg = instance.config as CustomAppConfig | null;
  const widgetCount = cfg?.widgets?.length ?? 0;

  return (
    <div className="group rounded-xl border border-border bg-card hover:border-[hsl(var(--primary)/0.3)] hover:shadow-[0_4px_16px_hsl(var(--primary)/0.08)] transition-all duration-200 overflow-hidden">
      {/* Header */}
      <div
        className="h-28 relative flex items-end p-4"
        style={{
          background: "linear-gradient(135deg, hsl(214 89% 52%) 0%, hsl(214 80% 38%) 100%)",
        }}
      >
        <div className="absolute inset-0 opacity-[0.06]" style={{
          backgroundImage: "radial-gradient(circle at 80% 20%, white 0%, transparent 50%)",
        }} />
        <div className="relative z-10">
          <div className="w-7 h-7 rounded-lg bg-white/15 border border-white/10 flex items-center justify-center mb-1.5 backdrop-blur-sm">
            <LayoutDashboard className="w-3.5 h-3.5 text-white/90" />
          </div>
          <p className="text-sm font-semibold text-white leading-tight">{instance.name}</p>
        </div>
        <div className="absolute top-3 right-3 z-10">
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
            className="p-1.5 rounded-md bg-white/10 hover:bg-white/20 text-white/70 transition-colors"
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 bg-card border border-border rounded-lg shadow-lg py-1 w-36 z-50">
              <button
                onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onDelete(); }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/5"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-3">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {widgetCount > 0 && (
            <span className="flex items-center gap-1">
              <LayoutDashboard className="w-3 h-3" />
              {widgetCount} widget{widgetCount !== 1 ? "s" : ""}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {new Date(instance.createdAt).toLocaleDateString()}
          </span>
        </div>
        <Button size="sm" variant="outline" className="w-full gap-1.5 text-xs h-8" onClick={onOpen}>
          Open app <ArrowRight className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}

function BuildFromScratchCard({ onClick }: { onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="group rounded-xl border border-dashed border-border hover:border-[hsl(var(--primary)/0.4)] bg-card hover:bg-[hsl(var(--primary)/0.02)] transition-all duration-200 cursor-pointer flex flex-col items-center justify-center min-h-[220px] gap-3 p-6"
    >
      <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center group-hover:scale-105 transition-transform duration-200 shadow-lg shadow-blue-500/20">
        <Sparkles className="w-5 h-5 text-white" />
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold text-foreground">Build with AI</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-[14rem]">
          Describe what you want in plain English. AI generates a live dashboard from your data.
        </p>
      </div>
      <span className="text-xs font-medium text-[hsl(var(--primary))] flex items-center gap-1 transition-colors">
        Start building <ArrowRight className="w-3 h-3" />
      </span>
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function AppsGalleryPage() {
  const router = useRouter();
  const [instances, setInstances] = useState<AppInstance[]>([]);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/apps/instances")
      .then((r) => r.json())
      .then((d) => { setInstances(d.instances ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function openTemplate(templateId: string, name: string, href: string) {
    const existing = instances.find((i) => i.template === templateId);
    if (!existing) {
      await fetch("/api/apps/instances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template: templateId, name }),
      });
    }
    router.push(href);
  }

  async function saveCustomApp(name: string, config: CustomAppConfig) {
    const res = await fetch("/api/apps/instances", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ template: "CUSTOM_DASHBOARD", name, config }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(errData.error ?? `Save failed (${res.status})`);
    }

    const data = await res.json() as AppInstance;
    setInstances((i) => [data, ...i]);
    setCreating(false);
    router.push(`/apps/${data.id}`);
  }

  async function deleteInstance(id: string) {
    await fetch(`/api/apps/instances/${id}`, { method: "DELETE" });
    setInstances((i) => i.filter((inst) => inst.id !== id));
  }

  const customInstances = instances.filter((i) => i.template === "CUSTOM_DASHBOARD");

  const filteredTemplates = TEMPLATES.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.tags.some((tag) => tag.toLowerCase().includes(search.toLowerCase()))
  );

  // ── Vibe coding view ─────────────────────────────────────────────────────
  if (creating) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col">
        <CreateAppPanel
          onBack={() => setCreating(false)}
          onSave={saveCustomApp}
        />
      </div>
    );
  }

  // ── Gallery view ─────────────────────────────────────────────────────────
  return (
    <div className="w-full max-w-6xl mx-auto px-1 py-2 space-y-10 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-foreground tracking-tight">App Gallery</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Use a template or build a custom dashboard from your data with AI.
          </p>
        </div>
        <Button
          onClick={() => setCreating(true)}
          className="gap-2"
        >
          <Plus className="w-4 h-4" />
          Build with AI
        </Button>
      </div>

      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search apps…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-[hsl(var(--primary))] placeholder:text-muted-foreground/50 shadow-[0_1px_2px_hsl(var(--foreground)/0.04)] transition-all duration-150"
          />
        </div>
      </div>

      {/* Your custom apps */}
      {!loading && customInstances.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Star className="w-3.5 h-3.5 text-[hsl(var(--primary))]" />
            <h2 className="text-sm font-semibold text-foreground">Your Apps</h2>
            <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">{customInstances.length}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {customInstances.map((inst) => (
              <CustomAppCard
                key={inst.id}
                instance={inst}
                onOpen={() => router.push(`/apps/${inst.id}`)}
                onDelete={() => deleteInstance(inst.id)}
              />
            ))}
            <BuildFromScratchCard onClick={() => setCreating(true)} />
          </div>
        </section>
      )}

      {/* Templates */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <LayoutDashboard className="w-3.5 h-3.5 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Ready-to-use Templates</h2>
          <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">{filteredTemplates.length}</span>
        </div>

        {filteredTemplates.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground text-sm">No templates match &quot;{search}&quot;</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredTemplates.map((template) => {
              const isOwned = instances.some((i) => i.template === template.id);
              return (
                <TemplateCard
                  key={template.id}
                  template={template}
                  isOwned={isOwned}
                  onClick={() => openTemplate(template.id, template.name, template.href)}
                />
              );
            })}
            {customInstances.length === 0 && (
              <BuildFromScratchCard onClick={() => setCreating(true)} />
            )}
          </div>
        )}
      </section>

      {/* Loading skeleton */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1,2,3].map((i) => (
            <div key={i} className="rounded-xl border border-border bg-card h-56 animate-pulse" />
          ))}
        </div>
      )}
    </div>
  );
}
