"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";

const INDUSTRIES = [
  "Manufacturing",
  "Distribution",
  "Logistics",
  "Food & Beverage",
  "Retail",
  "Other",
];

const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Istanbul",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Australia/Sydney",
  "Pacific/Auckland",
];

interface WorkspaceData {
  name: string;
  slug: string;
  industry: string | null;
  defaultTimezone: string | null;
}

export function WorkspaceSection({ data }: { data: WorkspaceData }) {
  const { success, error } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: data.name,
    industry: data.industry ?? "",
    defaultTimezone: data.defaultTimezone ?? "",
  });

  async function handleSave() {
    if (!form.name.trim()) {
      error("Workspace name is required.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/settings/workspace", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          industry: form.industry || null,
          defaultTimezone: form.defaultTimezone || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed to save");
      }
      success("Workspace settings saved.");
    } catch (err) {
      error(err instanceof Error ? err.message : "Failed to save workspace settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Workspace</h2>
        <p className="text-sm text-muted-foreground">Basic identity of your workspace.</p>
      </div>

      <div className="space-y-4 max-w-lg">
        <div className="space-y-2">
          <Label htmlFor="ws-name">Workspace name *</Label>
          <Input
            id="ws-name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </div>

        <div className="space-y-2">
          <Label>Workspace slug</Label>
          <Input value={data.slug} disabled className="opacity-60" />
          <p className="text-xs text-muted-foreground">Read-only. Set during workspace creation.</p>
        </div>

        <div className="space-y-2">
          <Label>Industry</Label>
          <Select value={form.industry} onValueChange={(v) => setForm((f) => ({ ...f, industry: v }))}>
            <SelectTrigger>
              <SelectValue placeholder="Select industry" />
            </SelectTrigger>
            <SelectContent>
              {INDUSTRIES.map((ind) => (
                <SelectItem key={ind} value={ind}>{ind}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Default timezone</Label>
          <Select value={form.defaultTimezone} onValueChange={(v) => setForm((f) => ({ ...f, defaultTimezone: v }))}>
            <SelectTrigger>
              <SelectValue placeholder="Select timezone" />
            </SelectTrigger>
            <SelectContent>
              {TIMEZONES.map((tz) => (
                <SelectItem key={tz} value={tz}>{tz.replace(/_/g, " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save workspace"}
        </Button>
      </div>
    </div>
  );
}
