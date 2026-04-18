"use client";

import { useState, useEffect, useCallback } from "react";
import { AlertTriangle, Plus, Trash2, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Rule {
  id: string;
  name: string;
  description: string | null;
  category: string;
  status: string;
  createdAt: string;
}

export default function RulesPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", category: "THRESHOLD", entity: "inventory" });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [deleteError, setDeleteError] = useState("");

  const fetchRules = useCallback(async () => {
    try {
      const res = await fetch("/api/brain/rules", { cache: "no-cache" });
      const data = await res.json();
      setRules(data.rules ?? []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    setSaving(true);
    try {
      const res = await fetch("/api/brain/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          description: form.description || undefined,
          category: form.category,
          entity: form.entity,
          condition: {},
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setFormError(typeof data.error === "string" ? data.error : "Failed to create rule.");
        return;
      }
      setForm({ name: "", description: "", category: "THRESHOLD", entity: "inventory" });
      setShowForm(false);
      await fetchRules();
    } catch {
      setFormError("Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this rule?")) return;
    setDeleteError("");
    try {
      const res = await fetch(`/api/brain/rules/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setDeleteError(data.error ?? "Failed to delete rule.");
        return;
      }
      setRules((prev) => prev.filter((r) => r.id !== id));
    } catch {
      setDeleteError("Something went wrong. Please try again.");
    }
  }

  const categoryColors: Record<string, string> = {
    THRESHOLD: "bg-blue-100 text-blue-700",
    POLICY: "bg-purple-100 text-purple-700",
    CONSTRAINT: "bg-orange-100 text-orange-700",
    KPI: "bg-green-100 text-green-700",
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Rules</h1>
          <p className="mt-1 text-sm text-muted-foreground">Define operational rules for your workspace.</p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)} className="gap-2">
          <Plus className="w-4 h-4" />
          Add Rule
        </Button>
      </div>

      {/* Chat integration banner */}
      <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-amber-800">Chat engine integration coming soon</p>
          <p className="text-sm text-amber-700 mt-0.5">
            Rules you create here are stored and active in the system. They will be automatically applied to the chat engine once connected — no action needed from you.
          </p>
        </div>
      </div>

      {/* Add Rule form */}
      {showForm && (
        <div className="rounded-lg border border-border bg-card p-5 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold text-foreground">New Rule</h2>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="rule-name" className="text-xs font-semibold">Name</Label>
                <Input id="rule-name" placeholder="e.g. Low stock threshold" value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rule-category" className="text-xs font-semibold">Category</Label>
                <select id="rule-category" value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring">
                  <option value="THRESHOLD">Threshold</option>
                  <option value="POLICY">Policy</option>
                  <option value="CONSTRAINT">Constraint</option>
                  <option value="KPI">KPI</option>
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rule-entity" className="text-xs font-semibold">Entity</Label>
              <Input id="rule-entity" placeholder="e.g. inventory, order, product" value={form.entity}
                onChange={(e) => setForm((f) => ({ ...f, entity: e.target.value }))} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rule-desc" className="text-xs font-semibold">Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input id="rule-desc" placeholder="What does this rule do?" value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
            <div className="flex gap-2">
              <Button type="submit" disabled={saving} size="sm">
                {saving ? "Saving…" : "Save Rule"}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => { setShowForm(false); setFormError(""); }}>
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Delete error */}
      {deleteError && (
        <p className="text-sm text-destructive rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2">
          {deleteError}
        </p>
      )}

      {/* Rules list */}
      {loading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">Loading rules…</div>
      ) : rules.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-border rounded-lg">
          <BookOpen className="w-10 h-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-foreground mb-1">No rules yet</p>
          <p className="text-sm text-muted-foreground max-w-xs mb-4">
            Rules help define thresholds, policies, and constraints for your operations. Start by adding your first rule.
          </p>
          <Button size="sm" onClick={() => setShowForm(true)} className="gap-2">
            <Plus className="w-3.5 h-3.5" />Add your first rule
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {rules.map((rule) => (
            <div key={rule.id} className="flex items-center justify-between px-4 py-3.5 rounded-lg border border-border bg-card hover:bg-muted/30 transition-colors">
              <div className="flex items-center gap-3 min-w-0">
                <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${categoryColors[rule.category] ?? "bg-muted text-muted-foreground"}`}>
                  {rule.category}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{rule.name}</p>
                  {rule.description && <p className="text-xs text-muted-foreground truncate">{rule.description}</p>}
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0 ml-4">
                <span className="text-xs text-muted-foreground hidden sm:block">
                  {new Date(rule.createdAt).toLocaleDateString()}
                </span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${rule.status === "ACTIVE" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}>
                  {rule.status}
                </span>
                <button onClick={() => handleDelete(rule.id)} className="text-muted-foreground hover:text-destructive transition-colors p-1 rounded">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
