"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

const FOCUS_AREAS = [
  "Inventory",
  "Procurement",
  "Production",
  "Sales",
  "Quality",
  "Supply Chain",
  "Finance",
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

interface ProfileData {
  name: string | null;
  email: string;
  jobTitle: string | null;
  companyName: string | null;
  industry: string | null;
  primaryFocus: string[];
  timezone: string | null;
  language: string | null;
  aiAnswerStyle: string | null;
}

export function ProfileForm({ initialData }: { initialData: ProfileData }) {
  const { success, error } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: initialData.name ?? "",
    jobTitle: initialData.jobTitle ?? "",
    companyName: initialData.companyName ?? "",
    industry: initialData.industry ?? "",
    primaryFocus: initialData.primaryFocus ?? [],
    timezone: initialData.timezone ?? "",
    language: initialData.language ?? "en",
    aiAnswerStyle: initialData.aiAnswerStyle ?? "",
  });

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleFocus(area: string) {
    setForm((prev) => ({
      ...prev,
      primaryFocus: prev.primaryFocus.includes(area)
        ? prev.primaryFocus.filter((a) => a !== area)
        : [...prev.primaryFocus, area],
    }));
  }

  async function handleSave() {
    if (!form.name.trim()) {
      error("Full name is required.");
      return;
    }
    if (!form.companyName.trim()) {
      error("Company name is required.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          jobTitle: form.jobTitle || null,
          companyName: form.companyName,
          industry: form.industry || null,
          primaryFocus: form.primaryFocus,
          timezone: form.timezone || null,
          language: form.language || "en",
          aiAnswerStyle: form.aiAnswerStyle || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save profile");
      }
      success("Profile saved successfully.");
    } catch (err) {
      error(err instanceof Error ? err.message : "Failed to save profile.");
    } finally {
      setSaving(false);
    }
  }

  const initials = form.name
    ? form.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
    : "?";

  return (
    <div className="max-w-2xl space-y-8">
      {/* Avatar */}
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[hsl(214,89%,52%)] to-[hsl(214,80%,38%)] flex items-center justify-center shrink-0">
          <span className="text-xl font-semibold text-white">{initials}</span>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{initialData.email}</p>
        </div>
      </div>

      {/* Full name */}
      <div className="space-y-2">
        <Label htmlFor="name">Full name *</Label>
        <Input
          id="name"
          value={form.name}
          onChange={(e) => update("name", e.target.value)}
          placeholder="Your full name"
        />
      </div>

      {/* Job title */}
      <div className="space-y-2">
        <Label htmlFor="jobTitle">Job title</Label>
        <Input
          id="jobTitle"
          value={form.jobTitle}
          onChange={(e) => update("jobTitle", e.target.value)}
          placeholder="e.g. Supply Chain Manager"
        />
      </div>

      {/* Company name */}
      <div className="space-y-2">
        <Label htmlFor="companyName">Company name *</Label>
        <Input
          id="companyName"
          value={form.companyName}
          onChange={(e) => update("companyName", e.target.value)}
          placeholder="Your company name"
        />
      </div>

      {/* Industry */}
      <div className="space-y-2">
        <Label>Industry</Label>
        <Select value={form.industry} onValueChange={(v) => update("industry", v)}>
          <SelectTrigger>
            <SelectValue placeholder="Select your industry" />
          </SelectTrigger>
          <SelectContent>
            {INDUSTRIES.map((ind) => (
              <SelectItem key={ind} value={ind}>
                {ind}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Primary focus */}
      <div className="space-y-2">
        <Label>Primary focus</Label>
        <p className="text-xs text-muted-foreground">Select the operational domains that matter most to you.</p>
        <div className="flex flex-wrap gap-2">
          {FOCUS_AREAS.map((area) => {
            const selected = form.primaryFocus.includes(area);
            return (
              <button
                key={area}
                type="button"
                onClick={() => toggleFocus(area)}
                className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                  selected
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-foreground border-border hover:bg-accent"
                }`}
              >
                {area}
              </button>
            );
          })}
        </div>
      </div>

      {/* Timezone */}
      <div className="space-y-2">
        <Label>Timezone</Label>
        <Select value={form.timezone} onValueChange={(v) => update("timezone", v)}>
          <SelectTrigger>
            <SelectValue placeholder="Select your timezone" />
          </SelectTrigger>
          <SelectContent>
            {TIMEZONES.map((tz) => (
              <SelectItem key={tz} value={tz}>
                {tz.replace(/_/g, " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Language (locked) */}
      <div className="space-y-2">
        <Label>Language</Label>
        <Select value="en" disabled>
          <SelectTrigger className="opacity-60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="en">English</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">English only for pilot.</p>
      </div>

      {/* AI answer style */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Label>AI answer style</Label>
          <Badge variant="info">Coming soon</Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          This preference will shape how Focus answers your questions. We&apos;ll activate it in an upcoming release.
        </p>
        <div className="flex gap-3">
          {(["concise", "detailed"] as const).map((style) => (
            <button
              key={style}
              type="button"
              onClick={() => update("aiAnswerStyle", style)}
              className={`flex-1 rounded-lg border p-3 text-left transition-colors ${
                form.aiAnswerStyle === style
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-accent"
              }`}
            >
              <p className="text-sm font-medium capitalize">{style}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {style === "concise"
                  ? "Short, direct answers"
                  : "Thorough explanations with context"}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Save */}
      <div className="pt-4">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save profile"}
        </Button>
      </div>
    </div>
  );
}
