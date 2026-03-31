"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight, X } from "lucide-react";

interface OnboardingNudgeProps {
  headline: string;
  body: string;
  ctaLabel?: string;
  ctaHref?: string;
  onCtaClick?: () => void;
  dismissable?: boolean;
  onDismiss?: () => void;
  variant?: "default" | "subtle";
}

/**
 * Inline onboarding nudge — non-blocking callout that appears in-context.
 * Never a modal, never an overlay. Takes up space in the layout.
 */
export function OnboardingNudge({
  headline,
  body,
  ctaLabel,
  ctaHref,
  onCtaClick,
  dismissable = true,
  onDismiss,
  variant = "default",
}: OnboardingNudgeProps) {
  const isSubtle = variant === "subtle";

  return (
    <div
      className={`relative rounded-xl border overflow-hidden ${
        isSubtle
          ? "border-border bg-muted/50"
          : "border-blue-200 bg-blue-50/60"
      }`}
      style={
        isSubtle
          ? undefined
          : { borderLeft: "3px solid hsl(214 89% 52%)" }
      }
    >
      <div className="p-4 pr-10">
        <h3
          className={`text-sm font-semibold leading-snug ${
            isSubtle ? "text-foreground" : "text-gray-900"
          }`}
        >
          {headline}
        </h3>
        <p
          className={`text-[13px] mt-1 leading-relaxed max-w-xl ${
            isSubtle ? "text-muted-foreground" : "text-gray-600"
          }`}
        >
          {body}
        </p>
        {ctaLabel && (
          <div className="mt-3">
            {ctaHref ? (
              <Button size="sm" asChild>
                <Link href={ctaHref}>
                  {ctaLabel}
                  <ArrowRight className="w-3 h-3 ml-1" />
                </Link>
              </Button>
            ) : (
              <Button size="sm" onClick={onCtaClick}>
                {ctaLabel}
                <ArrowRight className="w-3 h-3 ml-1" />
              </Button>
            )}
          </div>
        )}
      </div>
      {dismissable && onDismiss && (
        <button
          onClick={onDismiss}
          className="absolute top-3 right-3 p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          aria-label="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
