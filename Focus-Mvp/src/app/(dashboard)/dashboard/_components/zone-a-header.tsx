import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import type { DashboardJourneyState } from "../_lib/types";

interface ZoneAHeaderProps {
  journeyState: DashboardJourneyState;
  userName?: string | null;
  orgName?: string | null;
}

const CTA_CONFIG: Record<
  DashboardJourneyState,
  { label: string; href: string; variant: "default" | "outline" }
> = {
  NEW: { label: "Import your data", href: "/data/import", variant: "default" },
  DATA_ONLY: {
    label: "Capture your first rule",
    href: "/brain/new",
    variant: "default",
  },
  DATA_AND_BRAIN: {
    label: "Ask Focus a question",
    href: "/apps/chat",
    variant: "default",
  },
  ACTIVE: {
    label: "Ask Focus anything",
    href: "/apps/chat",
    variant: "outline",
  },
};

export function ZoneAHeader({
  journeyState,
  userName,
  orgName,
}: ZoneAHeaderProps) {
  const cta = CTA_CONFIG[journeyState];
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
