import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { DashboardData } from "../_lib/types";

interface ZoneERecentActivityProps {
  dataSources: DashboardData["dataSources"];
}

function relativeTime(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function badgeVariant(
  status: string
): "success" | "destructive" | "info" | "warning" {
  switch (status) {
    case "COMPLETED":
      return "success";
    case "FAILED":
      return "destructive";
    case "PROCESSING":
      return "info";
    default:
      return "warning";
  }
}

export function ZoneERecentActivity({
  dataSources,
}: ZoneERecentActivityProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-foreground">
          Recent activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="divide-y divide-border">
          {dataSources.map((source) => (
            <div
              key={source.id}
              className="flex items-center justify-between py-3 first:pt-0 last:pb-0 gap-4"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-gray-100 text-[11px] font-bold text-gray-400 uppercase">
                  {source.originalName?.split(".").pop()?.slice(0, 3) ?? "csv"}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {source.name}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {source.rowCount
                      ? `${source.rowCount.toLocaleString()} rows`
                      : source.originalName}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                  {relativeTime(source.createdAt)}
                </span>
                <Badge variant={badgeVariant(source.status)}>
                  {source.status.toLowerCase()}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
