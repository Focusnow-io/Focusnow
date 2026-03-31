import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, ArrowRight } from "lucide-react";
import type { OperationalAlert } from "@/lib/ode/types";

interface ZoneCAttentionProps {
  alerts: OperationalAlert[];
}

const SEVERITY_DOT: Record<
  OperationalAlert["severity"],
  { color: string; label: string }
> = {
  CRITICAL: { color: "hsl(0 72% 51%)", label: "Critical" },
  HIGH: { color: "hsl(24 95% 53%)", label: "High" },
  MEDIUM: { color: "hsl(38 92% 50%)", label: "Medium" },
  LOW: { color: "hsl(239 84% 67%)", label: "Low" },
};

const SEVERITY_BADGE: Record<
  OperationalAlert["severity"],
  "destructive" | "warning" | "info"
> = {
  CRITICAL: "destructive",
  HIGH: "warning",
  MEDIUM: "warning",
  LOW: "info",
};

export function ZoneCAttention({ alerts }: ZoneCAttentionProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <span className="text-sm font-semibold text-foreground">
            Attention items
          </span>
          {alerts.length > 0 && (
            <Badge variant="outline" className="tabular-nums">
              {alerts.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {alerts.length === 0 ? (
          <div className="flex items-center gap-2.5 py-2">
            <CheckCircle2
              className="w-4 h-4 shrink-0"
              style={{ color: "hsl(160 84% 39%)" }}
            />
            <span className="text-sm text-muted-foreground">
              No items need attention right now. Your operations look healthy.
            </span>
          </div>
        ) : (
          <div className="space-y-1">
            {alerts.map((alert) => {
              const sev = SEVERITY_DOT[alert.severity];
              return (
                <Link
                  key={alert.entityId}
                  href="/data/inventory"
                  className="group flex items-center gap-3 rounded-lg px-3 py-2.5 -mx-1 transition-all duration-150 hover:bg-accent/70"
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: sev.color }}
                    title={sev.label}
                  />

                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-foreground font-medium">
                      {alert.entityLabel}
                    </span>
                    <span className="text-sm text-muted-foreground ml-1.5">
                      &mdash;{" "}
                      {alert.message
                        .replace(alert.entityLabel, "")
                        .replace(/^\s*is\s*/i, "")
                        .trim()}
                    </span>
                  </div>

                  <Badge
                    variant={SEVERITY_BADGE[alert.severity]}
                    className="shrink-0"
                  >
                    {alert.severity.toLowerCase()}
                  </Badge>

                  <ArrowRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
