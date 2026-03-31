"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Settings2, Loader2, Pencil, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CustomAppRenderer } from "@/components/apps/CustomAppRenderer";
import { CreateAppPanel } from "@/components/apps/CreateAppPanel";
import type { CustomAppConfig } from "@/components/apps/widgets/types";

interface AppInstance {
  id: string;
  name: string;
  description: string | null;
  template: string;
  config: Record<string, unknown> | null;
  pinned: boolean;
  createdAt: string;
}

export default function CustomAppPage() {
  const { instanceId } = useParams<{ instanceId: string }>();
  const router = useRouter();

  const [instance, setInstance] = useState<AppInstance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/apps/instances/${instanceId}`)
      .then((r) => r.json())
      .then((d: AppInstance) => { setInstance(d); setNameValue(d.name); setLoading(false); })
      .catch(() => { setError("Failed to load app"); setLoading(false); });
  }, [instanceId]);

  async function saveName() {
    if (!nameValue.trim()) return;
    setSaving(true);
    const res = await fetch(`/api/apps/instances/${instanceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nameValue }),
    });
    const updated = await res.json() as AppInstance;
    setInstance(updated);
    setEditingName(false);
    setSaving(false);
  }

  async function saveRefineConfig(name: string, config: CustomAppConfig) {
    setSaving(true);
    const res = await fetch(`/api/apps/instances/${instanceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, config }),
    });
    const updated = await res.json() as AppInstance;
    setInstance(updated);
    setEditing(false);
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
      </div>
    );
  }

  if (error || !instance) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-gray-500">
        <p>{error ?? "App not found"}</p>
        <Button variant="outline" size="sm" onClick={() => router.push("/apps")}>
          Back to gallery
        </Button>
      </div>
    );
  }

  const config = instance.config as CustomAppConfig | null;

  // ── Editing / refine mode ─────────────────────────────────────────────────
  if (editing && config) {
    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col">
        <CreateAppPanel
          onBack={() => setEditing(false)}
          onSave={saveRefineConfig}
          initialConfig={config}
          initialName={instance.name}
        />
      </div>
    );
  }

  // ── View mode ─────────────────────────────────────────────────────────────
  return (
    <div className="w-full max-w-6xl mx-auto px-1 py-2 space-y-6">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/apps")} className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>

          {editingName ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setEditingName(false); }}
                className="text-xl font-bold text-gray-900 bg-gray-100 rounded-lg px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-gray-300"
              />
              <button onClick={saveName} disabled={saving} className="p-1 rounded text-gray-600 hover:bg-gray-100">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              </button>
              <button onClick={() => setEditingName(false)} className="p-1 rounded text-gray-400 hover:bg-gray-100">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-gray-900">{instance.name}</h1>
              <button onClick={() => setEditingName(true)} className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100">
                <Pencil className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        <Button variant="outline" size="sm" onClick={() => setEditing(true)} className="gap-1.5 text-xs">
          <Settings2 className="w-3.5 h-3.5" />
          Refine with AI
        </Button>
      </div>

      {/* App content */}
      {config ? (
        <CustomAppRenderer config={config} />
      ) : (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-gray-400 border-2 border-dashed border-gray-200 rounded-2xl">
          <p className="text-sm">This app has no configuration yet.</p>
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            Configure with AI
          </Button>
        </div>
      )}
    </div>
  );
}
