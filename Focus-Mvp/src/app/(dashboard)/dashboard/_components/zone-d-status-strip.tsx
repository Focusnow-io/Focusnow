import Link from "next/link";
import { Card } from "@/components/ui/card";
import { ArrowRight } from "lucide-react";
import type { DashboardData } from "../_lib/types";
import type { UserPermissions } from "@/lib/permissions";

interface ZoneDStatusStripProps {
  data: DashboardData;
  permissions: UserPermissions;
}

export function ZoneDStatusStrip({ data, permissions }: ZoneDStatusStripProps) {
  const isGap = (layer: "data" | "brain" | "apps") => {
    switch (layer) {
      case "data":
        return data.productCount === 0 && data.supplierCount === 0;
      case "brain":
        return data.activeRuleCount === 0 && data.draftRuleCount === 0;
      case "apps":
        return data.activeAppCount === 0;
    }
  };

  const showData = permissions.sources;
  const showBrain = permissions.brain;
  const showApps = permissions.apps;

  const visibleCount = [showData, showBrain, showApps].filter(Boolean).length;
  const gridClass =
    visibleCount === 3
      ? "grid-cols-3"
      : visibleCount === 2
        ? "grid-cols-2"
        : "grid-cols-1";

  return (
    <div className={`grid ${gridClass} gap-3`}>
      {showData && (
        <StatusCell
          dotColor="hsl(214 89% 52%)"
          label="Data"
          href={permissions.sources ? "/data" : null}
          isGap={isGap("data")}
          stats={
            data.productCount > 0 || data.supplierCount > 0
              ? [
                  { label: "Products", value: data.productCount },
                  { label: "Suppliers", value: data.supplierCount },
                  { label: "SKUs", value: data.inventoryCount },
                  { label: "Orders", value: data.orderCount },
                ]
              : []
          }
          emptyLabel="No data imported yet"
        />
      )}

      {showBrain && (
        <StatusCell
          dotColor="hsl(160 84% 39%)"
          label="Brain"
          href="/brain"
          isGap={isGap("brain")}
          stats={
            data.activeRuleCount > 0 || data.draftRuleCount > 0
              ? [
                  { label: "Active", value: data.activeRuleCount },
                  { label: "Draft", value: data.draftRuleCount },
                ]
              : []
          }
          domains={data.ruleDomains}
          emptyLabel="No rules yet"
        />
      )}

      {showApps && (
        <StatusCell
          dotColor="hsl(38 92% 50%)"
          label="Apps"
          href={permissions.apps ? "/apps" : null}
          isGap={isGap("apps")}
          stats={data.activeAppCount > 0 ? [{ label: "Active", value: data.activeAppCount }] : []}
          appNames={data.apps.map((a) => a.name)}
          emptyLabel="No apps running yet"
        />
      )}
    </div>
  );
}

interface StatusCellProps {
  dotColor: string;
  label: string;
  href: string | null;
  isGap: boolean;
  stats: Array<{ label: string; value: number }>;
  domains?: string[];
  appNames?: string[];
  emptyLabel: string;
}

function StatusCell({
  dotColor,
  label,
  href,
  isGap,
  stats,
  domains,
  appNames,
  emptyLabel,
}: StatusCellProps) {
  const hasStats = stats.length > 0;

  return (
    <Card
      className="p-4 flex flex-col gap-3 transition-all duration-200 hover:shadow-[0_4px_12px_hsl(var(--foreground)/0.06)]"
      style={isGap ? { borderStyle: "dashed", opacity: 0.6 } : undefined}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full shrink-0"
            style={{ background: dotColor }}
          />
          <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            {label}
          </span>
        </div>
        {href ? (
          <Link
            href={href}
            className="flex items-center gap-0.5 text-[11px] font-medium text-muted-foreground hover:text-primary transition-colors"
          >
            View
            <ArrowRight className="w-3 h-3" />
          </Link>
        ) : null}
      </div>

      {hasStats ? (
        <div className="flex items-center gap-3 flex-wrap">
          {stats.map((s, i) => (
            <span key={s.label} className="flex items-center gap-1.5">
              <span className="text-sm font-semibold tabular-nums text-foreground">
                {s.value.toLocaleString()}
              </span>
              <span className="text-xs text-muted-foreground">{s.label}</span>
              {i < stats.length - 1 && (
                <span className="text-border ml-1">&middot;</span>
              )}
            </span>
          ))}
        </div>
      ) : (
        <span className="text-xs text-muted-foreground">{emptyLabel}</span>
      )}

      {domains && domains.length > 0 && (
        <p className="text-xs text-muted-foreground leading-relaxed -mt-1">
          Covers {domains.join(", ")}
        </p>
      )}
      {appNames && appNames.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap -mt-1">
          {appNames.map((name) => (
            <span
              key={name}
              className="text-[11px] px-1.5 py-0.5 rounded-md bg-secondary text-secondary-foreground"
            >
              {name}
            </span>
          ))}
        </div>
      )}
    </Card>
  );
}
