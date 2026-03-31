"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Database,
  Brain,
  LayoutGrid,
  Home,
  Upload,
  Zap,
  BarChart3,
  AlertCircle,
  TableProperties,
  Truck,
  MessageSquare,
  Settings,
  HelpCircle,
  Sparkles,
  ChevronRight,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { UsageBar } from "./UsageBar";

interface SidebarProps {
  userName?: string | null;
  orgName?: string | null;
}

const navItems = [
  { href: "/dashboard", icon: Home, label: "Home" },
];

const navSections = [
  {
    id: "brain",
    label: "Brain",
    items: [
      { href: "/brain", icon: Brain, label: "Rules" },
    ],
  },
  {
    id: "apps",
    label: "Apps",
    items: [
      { href: "/apps", icon: LayoutGrid, label: "App Gallery" },
      { href: "/apps/chat", icon: MessageSquare, label: "Data Chat" },
    ],
  },
];

const dataSection = {
  id: "data",
  label: "Data",
  items: [
    { href: "/data", icon: Database, label: "Sources" },
    { href: "/data/import", icon: Upload, label: "Import" },
    { href: "/data/explore", icon: TableProperties, label: "Explorer" },
  ],
};

const bottomLinks = [
  { href: "/settings", icon: Settings, label: "Settings" },
  { href: "#", icon: HelpCircle, label: "Help & Support" },
  { href: "/settings#billing", icon: Sparkles, label: "Upgrade Plan" },
];

export function Sidebar({ userName, orgName }: SidebarProps) {
  const pathname = usePathname();
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    data: true,
    brain: true,
    apps: true,
  });

  const orgInitial = orgName ? orgName[0].toUpperCase() : "F";

  function toggleSection(id: string) {
    setExpandedSections((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function isActive(href: string) {
    if (href === "/dashboard" || href === "/apps") return pathname === href;
    return pathname.startsWith(href);
  }

  const itemBase =
    "flex items-center gap-2.5 px-2.5 py-[7px] rounded-lg text-[14px] transition-all duration-150 w-full";
  const itemInactive =
    "text-[hsl(var(--surface-nav-text-muted))] hover:bg-[hsl(var(--surface-nav-hover))] hover:text-[hsl(var(--surface-nav-text))]";
  const itemActive =
    "bg-[hsl(var(--surface-nav-active-bg))] text-white font-medium shadow-[0_1px_3px_hsl(var(--primary)/0.3)]";

  function NavItem({
    href,
    icon: Icon,
    label,
    expandable = false,
    sectionId,
  }: {
    href?: string;
    icon: React.ElementType;
    label: string;
    expandable?: boolean;
    sectionId?: string;
  }) {
    if (expandable && sectionId) {
      const expanded = expandedSections[sectionId];
      return (
        <button
          onClick={() => toggleSection(sectionId)}
          className={cn(itemBase, itemInactive, "justify-between")}
        >
          <span className="flex items-center gap-2.5">
            <Icon className="w-[15px] h-[15px] shrink-0 opacity-60" />
            {label}
          </span>
          <ChevronRight
            className={cn(
              "w-3.5 h-3.5 opacity-40 transition-transform duration-200",
              expanded && "rotate-90"
            )}
          />
        </button>
      );
    }
    const active = href ? isActive(href) : false;
    return (
      <Link
        href={href ?? "#"}
        className={cn(itemBase, active ? itemActive : itemInactive)}
      >
        <Icon className={cn("w-[15px] h-[15px] shrink-0", active ? "opacity-100" : "opacity-50")} />
        {label}
      </Link>
    );
  }

  return (
    <aside
      className="w-[250px] min-h-screen flex flex-col shrink-0"
      style={{
        background: "hsl(var(--surface-nav))",
        borderRight: "1px solid hsl(var(--surface-nav-border))",
      }}
    >
      {/* Project selector */}
      <div
        className="h-[52px] px-3 flex items-center gap-2.5 shrink-0"
        style={{ borderBottom: "1px solid hsl(var(--surface-nav-border))" }}
      >
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0">
          <Image src="/logo.svg" alt="Focus" width={28} height={28} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] text-[hsl(var(--surface-nav-text-muted))] truncate">{orgName ?? "Workspace"}</span>
            <span className="text-[13px] text-[hsl(var(--surface-nav-text-muted))] opacity-40">/</span>
            <span className="text-[13px] font-semibold text-[hsl(var(--surface-nav-text))] truncate">Focus</span>
          </div>
        </div>
        <div className="w-5 h-5 rounded-full bg-[hsl(var(--primary)/0.2)] flex items-center justify-center shrink-0">
          <span className="text-[9px] font-bold text-[hsl(var(--surface-nav-icon))]">
            {orgInitial}
          </span>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-2.5" style={{ borderBottom: "1px solid hsl(var(--surface-nav-border))" }}>
        <div className="flex items-center gap-2 px-2.5 py-[7px] rounded-lg bg-[hsl(var(--surface-nav-hover))] cursor-pointer hover:bg-[hsl(var(--surface-nav-border))] transition-colors">
          <Search className="w-[14px] h-[14px] text-[hsl(var(--surface-nav-text-muted))] opacity-60 shrink-0" />
          <span className="text-[14px] text-[hsl(var(--surface-nav-text-muted))] opacity-60 flex-1">Find...</span>
          <kbd className="text-[12px] text-[hsl(var(--surface-nav-text-muted))] font-medium bg-[hsl(var(--surface-nav))] border border-[hsl(var(--surface-nav-border))] rounded px-1.5 leading-5">F</kbd>
        </div>
      </div>

      {/* Main nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-px">
        {navItems.map((item) => (
          <NavItem key={item.href} href={item.href} icon={item.icon} label={item.label} />
        ))}

        {navSections.map((section) => (
          <div key={section.id}>
            <NavItem
              icon={section.id === "brain" ? Brain : LayoutGrid}
              label={section.label}
              expandable
              sectionId={section.id}
            />
            {expandedSections[section.id] && (
              <div className="pl-4 space-y-px">
                {section.items.map((item) => (
                  <NavItem key={item.href} href={item.href} icon={item.icon} label={item.label} />
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>

      {/* Data + bottom utility */}
      <div className="px-2 py-2 space-y-px" style={{ borderTop: "1px solid hsl(var(--surface-nav-border))" }}>
        <NavItem
          icon={Database}
          label={dataSection.label}
          expandable
          sectionId={dataSection.id}
        />
        {expandedSections[dataSection.id] && (
          <div className="pl-4 space-y-px">
            {dataSection.items.map((item) => (
              <NavItem key={item.href} href={item.href} icon={item.icon} label={item.label} />
            ))}
          </div>
        )}
        {bottomLinks.map((link) => (
          <NavItem key={link.label} href={link.href} icon={link.icon} label={link.label} />
        ))}
      </div>

      {/* Token usage bar */}
      <UsageBar />

      {/* User profile */}
      <Link
        href="/profile"
        className="px-3 py-3 flex items-center gap-2.5 hover:bg-[hsl(var(--surface-nav-hover))] transition-colors"
        style={{ borderTop: "1px solid hsl(var(--surface-nav-border))" }}
      >
        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[hsl(214,89%,52%)] to-[hsl(214,80%,38%)] flex items-center justify-center shrink-0">
          <span className="text-[10px] font-semibold text-white">
            {userName ? userName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() : "?"}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium text-[hsl(var(--surface-nav-text))] truncate leading-tight">
            {userName ?? "User"}
          </p>
          <p className="text-[12px] text-[hsl(var(--surface-nav-text-muted))] leading-tight">Free</p>
        </div>
      </Link>
    </aside>
  );
}
