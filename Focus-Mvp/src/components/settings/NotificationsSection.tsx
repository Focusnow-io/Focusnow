"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";

interface NotificationsData {
  notifyImportCompleted: boolean;
  notifyImportFailed: boolean;
  notifyRuleUpdated: boolean;
  notifyBillingIssue: boolean;
  notifyProductUpdates: boolean;
}

const NOTIFICATION_ITEMS: {
  key: keyof NotificationsData;
  label: string;
  description: string;
}[] = [
  {
    key: "notifyImportCompleted",
    label: "Data import completed",
    description: "Get notified when a data import finishes successfully.",
  },
  {
    key: "notifyImportFailed",
    label: "Data import failed",
    description: "Get notified when a data import fails or has errors.",
  },
  {
    key: "notifyRuleUpdated",
    label: "Rule updated",
    description: "Get notified when a rule is saved with a new version.",
  },
  {
    key: "notifyBillingIssue",
    label: "Billing / payment issue",
    description: "Get notified about payment failures or subscription issues.",
  },
  {
    key: "notifyProductUpdates",
    label: "Product updates",
    description: "Get notified about major new features shipped in Focus.",
  },
];

export function NotificationsSection({ data }: { data: NotificationsData }) {
  const { success, error } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<NotificationsData>({ ...data });

  function toggle(key: keyof NotificationsData) {
    setForm((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/notifications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed to save");
      }
      success("Notification preferences saved.");
    } catch (err) {
      error(err instanceof Error ? err.message : "Failed to save notification preferences.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Notifications</h2>
        <p className="text-sm text-muted-foreground">Control what Focus emails you about.</p>
      </div>

      <div className="space-y-4 max-w-lg">
        {NOTIFICATION_ITEMS.map((item) => (
          <div key={item.key} className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">{item.label}</Label>
              <p className="text-xs text-muted-foreground">{item.description}</p>
            </div>
            <Switch
              checked={form[item.key]}
              onCheckedChange={() => toggle(item.key)}
            />
          </div>
        ))}

        <div className="pt-2">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save notifications"}
          </Button>
        </div>
      </div>
    </div>
  );
}
