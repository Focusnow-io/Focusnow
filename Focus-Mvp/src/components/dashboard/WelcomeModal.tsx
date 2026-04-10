"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "welcome_dismissed_v1";

const ROLE_CONTENT: Record<string, { title: string; body: string; cta: string; ctaHref: string }> = {
  OWNER: {
    title: "Welcome — you're the workspace owner",
    body: "Start by importing your data, then define operational rules in the Brain, and deploy apps for your team. You have full control over members, permissions, and settings.",
    cta: "Import data",
    ctaHref: "/data/import",
  },
  ADMIN: {
    title: "Welcome back, Admin",
    body: "You have full admin access. You can manage team members, configure permissions, import data, set rules, and deploy apps across the workspace.",
    cta: "Go to dashboard",
    ctaHref: "/dashboard",
  },
  MEMBER: {
    title: "Welcome to Focus",
    body: "You can import data, create operational rules in the Brain, and use apps. Get started by uploading your first dataset — it only takes a minute.",
    cta: "Import data",
    ctaHref: "/data/import",
  },
  VIEWER: {
    title: "Welcome to Focus",
    body: "You have read-only access to the workspace. You can explore data, run reports, and use apps. Contact your workspace admin if you need additional permissions.",
    cta: "Explore data",
    ctaHref: "/data",
  },
};

export function WelcomeModal({ role }: { role: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      setVisible(true);
    }
  }, []);

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, "1");
    setVisible(false);
  }

  if (!visible) return null;

  const content = ROLE_CONTENT[role] ?? ROLE_CONTENT.VIEWER;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-md rounded-xl border bg-background shadow-xl p-6">
        <button
          onClick={dismiss}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="mb-4">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-3">
            <span className="text-lg">👋</span>
          </div>
          <h2 className="text-lg font-bold text-foreground">{content.title}</h2>
        </div>

        <p className="text-sm text-muted-foreground leading-relaxed mb-5">{content.body}</p>

        <div className="flex items-center gap-3">
          <Button asChild className="flex-1">
            <a href={content.ctaHref} onClick={dismiss}>
              {content.cta}
            </a>
          </Button>
          <Button variant="ghost" onClick={dismiss} className="flex-1">
            Dismiss
          </Button>
        </div>
      </div>
    </div>
  );
}
