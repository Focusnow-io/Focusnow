"use client";

import { useState, useEffect, useCallback } from "react";
import type { OnboardingResponse } from "@/app/api/onboarding/route";

const DISMISS_KEY_PREFIX = "focus_onboarding_dismiss_";

export type OnboardingStage = OnboardingResponse["stage"];

interface UseOnboardingStageReturn {
  stage: OnboardingStage | null;
  loading: boolean;
  data: OnboardingResponse | null;
  isDismissed: (nudgeId: string) => boolean;
  dismiss: (nudgeId: string) => void;
  refetch: () => void;
}

/**
 * Hook to fetch the current onboarding stage and manage nudge dismissals.
 * Dismissals are stored in sessionStorage (reset per browser session).
 */
export function useOnboardingStage(): UseOnboardingStageReturn {
  const [data, setData] = useState<OnboardingResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStage = useCallback(async () => {
    try {
      const res = await fetch("/api/onboarding");
      if (res.ok) {
        const json: OnboardingResponse = await res.json();
        setData(json);
      }
    } catch {
      // Silent fail — onboarding is non-critical
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStage();
  }, [fetchStage]);

  const isDismissed = useCallback((nudgeId: string): boolean => {
    if (typeof window === "undefined") return false;
    try {
      return sessionStorage.getItem(DISMISS_KEY_PREFIX + nudgeId) === "1";
    } catch {
      return false;
    }
  }, []);

  const dismiss = useCallback((nudgeId: string) => {
    if (typeof window === "undefined") return;
    try {
      sessionStorage.setItem(DISMISS_KEY_PREFIX + nudgeId, "1");
    } catch {
      // sessionStorage may be unavailable in some contexts
    }
  }, []);

  return {
    stage: data?.stage ?? null,
    loading,
    data,
    isDismissed,
    dismiss,
    refetch: fetchStage,
  };
}
