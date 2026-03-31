"use client";

import { useEffect, useState, useCallback } from "react";
import { Plug, RefreshCw, Plus, Play, CheckCircle, XCircle, Loader2, Clock, Webhook, Globe, FileText, Database, Server } from "lucide-react";

interface ConnectorSync {
  id: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  recordsRead: number;
  recordsUpserted: number;
  recordsFailed: number;
}

interface Connector {
  id: string;
  name: string;
  description: string | null;
  type: string;
  status: string;
  lastSyncAt: string | null;
  createdAt: string;
  _count: { syncs: number };
  syncs: ConnectorSync[];
}

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  FILE_IMPORT: FileText,
  REST_API:    Globe,
  WEBHOOK:     Webhook,
  DATABASE:    Database,
  SFTP:        Server,
};

const STATUS_STYLES: Record<string, string> = {
  ACTIVE:   "bg-green-100 text-green-700",
  INACTIVE: "bg-gray-100 text-gray-500",
  SYNCING:  "bg-blue-100 text-blue-700",
  ERROR:    "bg-red-100 text-red-700",
};

const SYNC_STATUS_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  COMPLETED: CheckCircle,
  FAILED:    XCircle,
  RUNNING:   Loader2,
  PENDING:   Clock,
  PARTIAL:   CheckCircle,
};

export default function ConnectorsPage() {
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchConnectors = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/connectors");
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setConnectors(data.connectors ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load connectors");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchConnectors(); }, [fetchConnectors]);

  const triggerSync = async (id: string) => {
    setSyncing(id);
    try {
      const res = await fetch(`/api/connectors/${id}/sync`, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      await fetchConnectors();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(null);
    }
  };

  return (
    <div className="space-y-6 w-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
            <Plug className="w-5 h-5 text-slate-500" />
            Connectors
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Registered operational system connections
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchConnectors}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
          <a
            href="https://github.com/nir-dotcom/Focus-product"
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-slate-900 text-white rounded-md hover:bg-slate-700"
          >
            <Plus className="w-3.5 h-3.5" />
            Add via API
          </a>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* API hint */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-xs text-slate-600 font-mono">
        <span className="text-slate-400">POST</span> /api/connectors
        {" "}
        <span className="text-slate-400 font-sans font-normal">· Create a connector by POSTing</span>
        {" { name, type, config: { entityType, fieldMapping?, ... } }"}
      </div>

      {connectors.length === 0 && !loading ? (
        <div className="text-center py-16 text-gray-400">
          <Plug className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">No connectors registered yet</p>
          <p className="text-xs mt-1">Use the API to create FILE_IMPORT, REST_API, or WEBHOOK connectors.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {connectors.map((c) => {
            const TypeIcon = TYPE_ICONS[c.type] ?? Plug;
            const lastSync = c.syncs[0] ?? null;
            const LastSyncIcon = lastSync ? SYNC_STATUS_ICON[lastSync.status] ?? Clock : null;

            return (
              <div key={c.id} className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                      <TypeIcon className="w-4 h-4 text-slate-600" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-slate-800">{c.name}</span>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full uppercase ${STATUS_STYLES[c.status] ?? "bg-gray-100 text-gray-500"}`}>
                          {c.status}
                        </span>
                        <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full uppercase font-semibold">
                          {c.type.replace(/_/g, " ")}
                        </span>
                      </div>
                      {c.description && (
                        <p className="text-xs text-gray-500 mt-0.5">{c.description}</p>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => triggerSync(c.id)}
                    disabled={syncing === c.id || c.status === "SYNCING"}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-slate-900 text-white rounded-md hover:bg-slate-700 disabled:opacity-50 shrink-0"
                  >
                    {syncing === c.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Play className="w-3 h-3" />
                    )}
                    Sync
                  </button>
                </div>

                {/* Last sync summary */}
                {lastSync && (
                  <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-4 text-xs text-gray-500">
                    {LastSyncIcon && (
                      <span className="flex items-center gap-1">
                        <LastSyncIcon
                          className={`w-3.5 h-3.5 ${
                            lastSync.status === "COMPLETED" ? "text-green-500" :
                            lastSync.status === "FAILED"    ? "text-red-500" :
                            lastSync.status === "RUNNING"   ? "text-blue-500 animate-spin" :
                            "text-gray-400"
                          }`}
                        />
                        {lastSync.status}
                      </span>
                    )}
                    <span>{new Date(lastSync.startedAt).toLocaleString()}</span>
                    <span className="text-green-600 font-medium">{lastSync.recordsUpserted} upserted</span>
                    {lastSync.recordsFailed > 0 && (
                      <span className="text-red-500 font-medium">{lastSync.recordsFailed} failed</span>
                    )}
                    <span className="ml-auto text-gray-400">{c._count.syncs} total sync{c._count.syncs !== 1 ? "s" : ""}</span>
                  </div>
                )}

                {!lastSync && (
                  <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-400">
                    Never synced · created {new Date(c.createdAt).toLocaleDateString()}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
