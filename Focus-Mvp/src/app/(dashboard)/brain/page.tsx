"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Brain, Plus, Zap, GitBranch, Clock } from "lucide-react";
import { formatDate } from "@/lib/utils";

interface Rule {
  id: string;
  name: string;
  description: string | null;
  category: string;
  entity: string;
  status: string;
  currentVersion: number;
  tags: string[];
  updatedAt: string;
  _count: { versions: number };
}

const CATEGORY_COLOR: Record<string, string> = {
  THRESHOLD: "bg-amber-100 text-amber-800",
  POLICY: "bg-blue-100 text-blue-800",
  CONSTRAINT: "bg-purple-100 text-purple-800",
  KPI: "bg-green-100 text-green-800",
};

const STATUS_VARIANT: Record<string, "success" | "warning" | "outline"> = {
  ACTIVE: "success",
  DRAFT: "warning",
  ARCHIVED: "outline",
};

export default function BrainPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/brain/rules", { cache: "no-cache" })
      .then((r) => r.json())
      .then((d) => {
        setRules(d.rules ?? []);
        setLoading(false);
      });
  }, []);

  const grouped = rules.reduce<Record<string, Rule[]>>((acc, rule) => {
    const cat = rule.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(rule);
    return acc;
  }, {});

  return (
    <div className="space-y-6 w-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            Operational Brain
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Layer 2 — Versioned rules, policies, and constraints
          </p>
        </div>
        <Button asChild>
          <Link href="/brain/new">
            <Plus className="w-4 h-4 mr-2" /> New rule
          </Link>
        </Button>
      </div>

      {loading ? (
        <div className="py-12 text-center text-gray-400 text-sm">Loading...</div>
      ) : rules.length === 0 ? (
        <div className="py-16 text-center border-2 border-dashed rounded-xl">
          <Brain className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <h3 className="font-semibold text-gray-600 mb-1">
            This is where your operational logic lives.
          </h3>
          <p className="text-sm text-gray-400 mb-4 max-w-sm mx-auto">
            Capture a policy, a formula, a workflow, or a constraint — anything
            that governs how your team makes decisions.
          </p>
          <Button asChild>
            <Link href="/brain/new">Create your first rule</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([category, catRules]) => (
            <div key={category}>
              <div className="flex items-center gap-2 mb-3">
                <span
                  className={`px-2 py-0.5 rounded text-xs font-semibold ${
                    CATEGORY_COLOR[category] ?? "bg-gray-100 text-gray-700"
                  }`}
                >
                  {category}
                </span>
                <span className="text-sm text-gray-400">
                  {catRules.length} rule{catRules.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="space-y-2">
                {catRules.map((rule) => (
                  <Card key={rule.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                            <Zap className="w-4 h-4 text-slate-600" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Link
                                href={`/brain/${rule.id}`}
                                className="font-semibold text-sm hover:underline"
                              >
                                {rule.name}
                              </Link>
                              <Badge
                                variant={
                                  STATUS_VARIANT[rule.status] ?? "outline"
                                }
                              >
                                {rule.status.toLowerCase()}
                              </Badge>
                              {rule.tags.map((tag) => (
                                <span
                                  key={tag}
                                  className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                            {rule.description && (
                              <p className="text-xs text-gray-500 mt-1">
                                {rule.description}
                              </p>
                            )}
                            <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400">
                              <span className="flex items-center gap-1">
                                <GitBranch className="w-3 h-3" />
                                v{rule.currentVersion}
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {formatDate(rule.updatedAt)}
                              </span>
                              <span>on {rule.entity}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Link
                            href={`/brain/${rule.id}`}
                            className="text-xs text-slate-700 hover:underline"
                          >
                            View →
                          </Link>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
