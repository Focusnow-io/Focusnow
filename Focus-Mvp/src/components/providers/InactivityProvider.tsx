"use client";

import { useEffect, useRef } from "react";
import { signOut } from "next-auth/react";

/** Signs the user out after 10 minutes of no UI activity. */
export function InactivityProvider({ children }: { children: React.ReactNode }) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

  useEffect(() => {
    function resetTimer() {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        signOut({ callbackUrl: "/login" });
      }, TIMEOUT_MS);
    }

    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, resetTimer, { passive: true }));
    resetTimer(); // start the timer on mount

    return () => {
      events.forEach((e) => window.removeEventListener(e, resetTimer));
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return <>{children}</>;
}
