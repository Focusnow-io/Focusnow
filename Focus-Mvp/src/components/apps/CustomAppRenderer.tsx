"use client";

import { useState } from "react";
import {
  BarChart3, Box, ClipboardList, Home, LayoutDashboard,
  Package, Settings, ShoppingCart, Truck, Users, Warehouse,
} from "lucide-react";
import { AppStateProvider } from "./widgets/AppStateProvider";
import { ToastProvider } from "./widgets/ToastProvider";
import { ConfirmProvider } from "./widgets/ConfirmModal";
import { StatCardWidget } from "./widgets/StatCardWidget";
import { ChartWidget } from "./widgets/ChartWidget";
import { TableWidget } from "./widgets/TableWidget";
import { AlertListWidget } from "./widgets/AlertListWidget";
import { ProgressBarWidget } from "./widgets/ProgressBarWidget";
import { FilterBarWidget } from "./widgets/FilterBarWidget";
import { FormWidget } from "./widgets/FormWidget";
import { KanbanWidget } from "./widgets/KanbanWidget";
import { InsightWidget } from "./widgets/InsightWidget";
import { SimulatorWidget } from "./widgets/SimulatorWidget";
import type { CustomAppConfig, WidgetConfig, TabDef, PageDef } from "./widgets/types";

const SIZE_CLASSES: Record<string, string> = {
  sm:   "col-span-12 sm:col-span-6 lg:col-span-3",
  md:   "col-span-12 sm:col-span-6 lg:col-span-6",
  lg:   "col-span-12 lg:col-span-9",
  full: "col-span-12",
};

// Icon map for sidebar pages
const ICON_MAP: Record<string, React.ReactNode> = {
  home: <Home className="w-4 h-4" />,
  dashboard: <LayoutDashboard className="w-4 h-4" />,
  products: <Package className="w-4 h-4" />,
  inventory: <Warehouse className="w-4 h-4" />,
  orders: <ShoppingCart className="w-4 h-4" />,
  suppliers: <Truck className="w-4 h-4" />,
  customers: <Users className="w-4 h-4" />,
  production: <ClipboardList className="w-4 h-4" />,
  analytics: <BarChart3 className="w-4 h-4" />,
  settings: <Settings className="w-4 h-4" />,
  default: <Box className="w-4 h-4" />,
};

function getIcon(name?: string): React.ReactNode {
  if (!name) return ICON_MAP.default;
  return ICON_MAP[name.toLowerCase()] ?? ICON_MAP.default;
}

function Widget({ widget }: { widget: WidgetConfig }) {
  switch (widget.type) {
    case "stat_card":
      return <StatCardWidget widget={widget} />;
    case "bar_chart":
    case "pie_chart":
    case "line_chart":
      return <ChartWidget widget={widget} />;
    case "table":
      return <TableWidget widget={widget} />;
    case "alert_list":
      return <AlertListWidget widget={widget} />;
    case "progress_bar":
      return <ProgressBarWidget widget={widget} />;
    case "filter_bar":
      return <FilterBarWidget widget={widget} />;
    case "form":
      return <FormWidget widget={widget} />;
    case "detail_view":
      return <TableWidget widget={{ ...widget, detailPanel: true }} />;
    case "kanban":
      return <KanbanWidget widget={widget} />;
    case "insight":
      return <InsightWidget widget={widget} />;
    case "simulator":
      return <SimulatorWidget widget={widget} />;
    default:
      return null;
  }
}

function WidgetGrid({ widgets }: { widgets: WidgetConfig[] }) {
  return (
    <div className="grid grid-cols-12 gap-4">
      {widgets.map((widget) => (
        <div key={widget.id} className={SIZE_CLASSES[widget.size] ?? SIZE_CLASSES.md}>
          <Widget widget={widget} />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tabbed layout
// ---------------------------------------------------------------------------

function TabbedLayout({ tabs, allWidgets }: { tabs: TabDef[]; allWidgets: WidgetConfig[] }) {
  const [activeTab, setActiveTab] = useState(0);
  const widgetMap = new Map(allWidgets.map((w) => [w.id, w]));

  const tabbedIds = new Set(tabs.flatMap((t) => t.widgetIds));
  const topWidgets = allWidgets.filter((w) => !tabbedIds.has(w.id));

  return (
    <div className="space-y-4">
      {topWidgets.length > 0 && <WidgetGrid widgets={topWidgets} />}

      <div className="border-b border-border">
        <nav className="flex gap-1 px-1 -mb-px">
          {tabs.map((tab, i) => (
            <button
              key={tab.label}
              onClick={() => setActiveTab(i)}
              className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
                i === activeTab
                  ? "text-blue-600 bg-card border border-border border-b-card -mb-px"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      <WidgetGrid
        widgets={tabs[activeTab]?.widgetIds
          .map((id) => widgetMap.get(id))
          .filter((w): w is WidgetConfig => !!w) ?? []}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Multi-page sidebar layout
// ---------------------------------------------------------------------------

function MultiPageLayout({ pages, allWidgets, title }: { pages: PageDef[]; allWidgets: WidgetConfig[]; title: string }) {
  const [activePage, setActivePage] = useState(0);
  const widgetMap = new Map(allWidgets.map((w) => [w.id, w]));

  const currentPage = pages[activePage];
  const pageWidgets = currentPage?.widgetIds
    .map((id) => widgetMap.get(id))
    .filter((w): w is WidgetConfig => !!w) ?? [];

  return (
    <div className="flex min-h-[600px] -mx-2">
      {/* Sidebar */}
      <div className="w-56 shrink-0 border-r border-border bg-muted/50 rounded-l-xl">
        <div className="px-4 py-4 border-b border-border">
          <h2 className="text-sm font-bold text-foreground truncate">{title}</h2>
        </div>
        <nav className="p-2 space-y-0.5">
          {pages.map((pg, i) => (
            <button
              key={pg.id}
              onClick={() => setActivePage(i)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                i === activePage
                  ? "text-blue-700 bg-blue-50"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {getIcon(pg.icon)}
              <span className="truncate">{pg.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div className="flex-1 p-6 min-w-0">
        <h2 className="text-lg font-semibold text-foreground mb-4">{currentPage?.label}</h2>
        <WidgetGrid widgets={pageWidgets} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main renderer
// ---------------------------------------------------------------------------

interface Props {
  config: CustomAppConfig;
}

export function CustomAppRenderer({ config }: Props) {
  const tabWidget = config.widgets.find((w) => w.tabs && w.tabs.length > 0);
  const tabs = tabWidget?.tabs;
  const pages = config.pages;

  return (
    <AppStateProvider>
      <ToastProvider>
        <ConfirmProvider>
          <div className="space-y-6">
            {/* Only show title if not multi-page (sidebar has its own title) */}
            {!pages && (
              <div>
                <h1 className="text-2xl font-bold text-foreground">{config.title}</h1>
                {config.description && <p className="text-sm text-muted-foreground mt-1">{config.description}</p>}
              </div>
            )}

            {pages && pages.length > 0 ? (
              <MultiPageLayout pages={pages} allWidgets={config.widgets} title={config.title} />
            ) : tabs ? (
              <TabbedLayout tabs={tabs} allWidgets={config.widgets.filter((w) => w !== tabWidget)} />
            ) : (
              <WidgetGrid widgets={config.widgets} />
            )}
          </div>
        </ConfirmProvider>
      </ToastProvider>
    </AppStateProvider>
  );
}
