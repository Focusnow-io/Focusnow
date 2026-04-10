import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import type { DashboardJourneyState } from "../_lib/types";
import type { UserPermissions } from "@/lib/permissions";

interface ZoneAHeaderProps {
  journeyState: DashboardJourneyState;
  userName?: string | null;
  orgName?: string | null;
  permissions: UserPermissions;
}

function getCta(
  journeyState: DashboardJourneyState,
  permissions: UserPermissions,
): { label: string; href: string; variant: "default" | "outline" } {
  switch (journeyState) {
    case "NEW":
      if (permissions.import) {
        return { label: "Import your data", href: "/data/import", variant: "default" };
      }
      if (permissions.sources) {
        return { label: "View data", href: "/data", variant: "outline" };
      }
      if (permissions.chat) {
        return { label: "Ask Focus a question", href: "/apps/chat", variant: "outline" };
      }
      return { label: "View dashboard", href: "/dashboard", variant: "outline" };
    case "DATA_ONLY":
      if (permissions.brain) {
        return { label: "Capture your first rule", href: "/brain/new", variant: "default" };
      }
      if (permissions.chat) {
        return { label: "Ask Focus a question", href: "/apps/chat", variant: "default" };
      }
      return { label: "View your data", href: "/data", variant: "outline" };
    case "DATA_AND_BRAIN":
      if (permissions.chat) {
        return { label: "Ask Focus a question", href: "/apps/chat", variant: "default" };
      }
      if (permissions.apps) {
        return { label: "Browse apps", href: "/apps", variant: "outline" };
      }
      return { label: "View your data", href: "/data", variant: "outline" };
    case "ACTIVE":
      if (permissions.chat) {
        return { label: "Ask Focus anything", href: "/apps/chat", variant: "outline" };
      }
      if (permissions.apps) {
        return { label: "Browse apps", href: "/apps", variant: "outline" };
      }
      return { label: "View your data", href: "/data", variant: "outline" };
  }
}

export function ZoneAHeader({
  journeyState,
  userName,
  orgName,
  permissions,
}: ZoneAHeaderProps) {
  const cta = getCta(journeyState, permissions);
  const firstName = userName?.split(" ")[0];

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[22px] font-bold tracking-tight text-foreground">
          {journeyState === "NEW"
            ? firstName
              ? `Welcome, ${firstName}`
              : "Welcome"
            : firstName
              ? `Welcome back, ${firstName}`
              : "Welcome back"}
        </h1>
        {journeyState === "NEW" ? (
          <p className="text-muted-foreground mt-0.5 text-sm">
            Let&apos;s get Focus set up for {orgName ?? "your team"}.
          </p>
        ) : (
          <p className="text-muted-foreground mt-0.5 text-sm">
            {orgName ?? "Workspace"}
          </p>
        )}
      </div>
      <Button variant={cta.variant} size="sm" asChild className="shrink-0">
        <Link href={cta.href}>
          {cta.label}
          <ArrowRight className="w-3 h-3" />
        </Link>
      </Button>
    </div>
  );
}
