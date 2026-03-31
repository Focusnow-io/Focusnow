"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Panel,
  type Node,
  type Edge,
  MarkerType,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { RefreshCw, Share2 } from "lucide-react";

// ---------------------------------------------------------------------------
// Types (mirrors ODE types)
// ---------------------------------------------------------------------------

type OdeEntityType =
  | "PRODUCT"
  | "SUPPLIER"
  | "LOCATION"
  | "INVENTORY_ITEM"
  | "ORDER"
  | "ORDER_LINE";

type RelationshipType =
  | "SUPPLIES"
  | "STOCKS_AT"
  | "SOURCES_FROM"
  | "FULFILLS"
  | "COMPONENT_OF"
  | "LOCATED_IN"
  | "TRANSFERS_BETWEEN"
  | "SHIPS_TO";

interface GraphNode {
  id: string;
  type: OdeEntityType;
  label: string;
  properties: Record<string, unknown>;
  lastSeenAt: string;
}

interface GraphEdge {
  id: string;
  type: RelationshipType;
  sourceType: OdeEntityType;
  sourceId: string;
  targetType: OdeEntityType;
  targetId: string;
  strength?: number;
  metadata?: Record<string, unknown>;
}

interface OperationalGraph {
  organizationId: string;
  generatedAt: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: {
    nodeCount: number;
    edgeCount: number;
    nodesByType: Record<string, number>;
    edgesByType: Record<string, number>;
  };
}

// ---------------------------------------------------------------------------
// Visual config
// ---------------------------------------------------------------------------

const NODE_COLORS: Record<OdeEntityType, { bg: string; border: string; text: string; dot: string }> = {
  PRODUCT:       { bg: "#eff6ff", border: "#3b82f6", text: "#1e40af", dot: "#3b82f6" },
  SUPPLIER:      { bg: "#faf5ff", border: "#a855f7", text: "#6b21a8", dot: "#a855f7" },
  LOCATION:      { bg: "#f0fdf4", border: "#22c55e", text: "#14532d", dot: "#22c55e" },
  INVENTORY_ITEM:{ bg: "#fff7ed", border: "#f97316", text: "#7c2d12", dot: "#f97316" },
  ORDER:         { bg: "#fffbeb", border: "#eab308", text: "#713f12", dot: "#eab308" },
  ORDER_LINE:    { bg: "#fdf4ff", border: "#d946ef", text: "#701a75", dot: "#d946ef" },
};

const EDGE_COLORS: Record<RelationshipType, string> = {
  SUPPLIES:          "#a855f7",
  STOCKS_AT:         "#3b82f6",
  SOURCES_FROM:      "#eab308",
  FULFILLS:          "#f97316",
  COMPONENT_OF:      "#6366f1",
  LOCATED_IN:        "#22c55e",
  TRANSFERS_BETWEEN: "#06b6d4",
  SHIPS_TO:          "#ec4899",
};

const TYPE_LABELS: Record<OdeEntityType, string> = {
  PRODUCT: "Product",
  SUPPLIER: "Supplier",
  LOCATION: "Location",
  INVENTORY_ITEM: "Inventory",
  ORDER: "Order",
  ORDER_LINE: "Order Line",
};

// Column order for layout
const COLUMN_ORDER: OdeEntityType[] = [
  "SUPPLIER",
  "PRODUCT",
  "INVENTORY_ITEM",
  "LOCATION",
  "ORDER",
  "ORDER_LINE",
];

const NODE_W = 200;
const NODE_H = 72;
const COL_GAP = 280;
const ROW_GAP = 100;

// ---------------------------------------------------------------------------
// Layout — arrange nodes in vertical columns by entity type
// ---------------------------------------------------------------------------

function layoutNodes(odeNodes: GraphNode[]): Node[] {
  const columns: Record<string, GraphNode[]> = {};
  for (const n of odeNodes) {
    if (!columns[n.type]) columns[n.type] = [];
    columns[n.type].push(n);
  }

  const result: Node[] = [];
  let colIndex = 0;

  for (const colType of COLUMN_ORDER) {
    const colNodes = columns[colType] ?? [];
    if (colNodes.length === 0) continue;

    colNodes.forEach((n, rowIndex) => {
      const colors = NODE_COLORS[n.type as OdeEntityType] ?? NODE_COLORS.PRODUCT;
      result.push({
        id: n.id,
        position: { x: colIndex * COL_GAP, y: rowIndex * ROW_GAP },
        data: {
          label: n.label,
          entityType: n.type,
          properties: n.properties,
          colors,
        },
        type: "odeNode",
        style: { width: NODE_W },
      });
    });

    colIndex++;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Custom node renderer
// ---------------------------------------------------------------------------

function OdeNodeComponent({ data }: { data: {
  label: string;
  entityType: OdeEntityType;
  properties: Record<string, unknown>;
  colors: { bg: string; border: string; text: string; dot: string };
} }) {
  const { label, entityType, colors } = data;
  const [name, ...rest] = label.split(" — ");

  return (
    <div
      style={{
        background: colors.bg,
        border: `1.5px solid ${colors.border}`,
        borderRadius: 8,
        padding: "8px 10px",
        minWidth: 160,
        maxWidth: 200,
        boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: colors.dot,
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            color: colors.text,
            opacity: 0.7,
          }}
        >
          {TYPE_LABELS[entityType] ?? entityType}
        </span>
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: colors.text, lineHeight: 1.3 }}>
        {name}
      </div>
      {rest.length > 0 && (
        <div style={{ fontSize: 11, color: colors.text, opacity: 0.6, marginTop: 1 }}>
          {rest.join(" — ")}
        </div>
      )}
    </div>
  );
}

const nodeTypes = { odeNode: OdeNodeComponent };

// ---------------------------------------------------------------------------
// Edge builder
// ---------------------------------------------------------------------------

function buildEdges(odeEdges: GraphEdge[], activeTypes: Set<RelationshipType>): Edge[] {
  return odeEdges
    .filter((e) => activeTypes.has(e.type))
    .map((e) => ({
      id: e.id,
      source: e.sourceId,
      target: e.targetId,
      label: e.type.replace(/_/g, " "),
      type: "smoothstep",
      animated: e.type === "STOCKS_AT" || e.type === "SUPPLIES",
      markerEnd: { type: MarkerType.ArrowClosed, color: EDGE_COLORS[e.type], width: 14, height: 14 },
      style: { stroke: EDGE_COLORS[e.type], strokeWidth: 1.5 },
      labelStyle: { fontSize: 9, fill: EDGE_COLORS[e.type], fontWeight: 600 },
      labelBgStyle: { fill: "white", fillOpacity: 0.85 },
    }));
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export default function OperationalGraphPage() {
  const [graph, setGraph] = useState<OperationalGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeEdgeTypes, setActiveEdgeTypes] = useState<Set<RelationshipType>>(
    new Set(Object.keys(EDGE_COLORS) as RelationshipType[])
  );
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const fetchGraph = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ode/graph");
      if (!res.ok) throw new Error(await res.text());
      const data: OperationalGraph = await res.json();
      setGraph(data);
      setNodes(layoutNodes(data.nodes));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load graph");
    } finally {
      setLoading(false);
    }
  }, [setNodes]);

  useEffect(() => { fetchGraph(); }, [fetchGraph]);

  useEffect(() => {
    if (!graph) return;
    setEdges(buildEdges(graph.edges, activeEdgeTypes));
  }, [graph, activeEdgeTypes, setEdges]);

  const toggleEdgeType = (type: RelationshipType) => {
    setActiveEdgeTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (!graph) return;
      const found = graph.nodes.find((n) => n.id === node.id) ?? null;
      setSelectedNode(found);
    },
    [graph]
  );

  const stats = graph?.stats;
  const generatedAt = graph?.generatedAt
    ? new Date(graph.generatedAt).toLocaleTimeString()
    : null;

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b bg-white">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <Share2 className="w-5 h-5 text-slate-500" />
            Operational Graph
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Live operational model — nodes, relationships, and current state
            {generatedAt && <> · refreshed at {generatedAt}</>}
          </p>
        </div>
        <button
          onClick={fetchGraph}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-slate-900 text-white rounded-md hover:bg-slate-700 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left panel — stats + filters */}
        <aside className="w-56 border-r bg-gray-50 flex flex-col overflow-y-auto p-3 gap-4 shrink-0">
          {/* Stats */}
          {stats && (
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Graph Stats
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                <StatChip label="Nodes" value={stats.nodeCount} />
                <StatChip label="Edges" value={stats.edgeCount} />
              </div>
              <div className="mt-2 space-y-1">
                {Object.entries(stats.nodesByType).map(([type, count]) => {
                  const colors = NODE_COLORS[type as OdeEntityType];
                  return (
                    <div key={type} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ background: colors?.dot ?? "#94a3b8" }}
                        />
                        <span className="text-gray-600">{TYPE_LABELS[type as OdeEntityType] ?? type}</span>
                      </span>
                      <span className="font-semibold text-gray-800">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Edge type filters */}
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Edge Types
            </p>
            <div className="space-y-1">
              {(Object.keys(EDGE_COLORS) as RelationshipType[]).map((type) => {
                const active = activeEdgeTypes.has(type);
                const count = graph?.stats.edgesByType[type] ?? 0;
                return (
                  <button
                    key={type}
                    onClick={() => toggleEdgeType(type)}
                    className={`w-full flex items-center justify-between px-2 py-1 rounded text-xs transition-opacity ${
                      active ? "opacity-100" : "opacity-40"
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      <span
                        className="w-2.5 h-1.5 rounded-sm"
                        style={{ background: EDGE_COLORS[type] }}
                      />
                      <span className="text-gray-700 font-medium">{type.replace(/_/g, " ")}</span>
                    </span>
                    <span className="text-gray-400">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected node detail */}
          {selectedNode && (
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Selected Node
              </p>
              <div
                className="rounded-lg p-2.5 text-xs"
                style={{
                  background: NODE_COLORS[selectedNode.type as OdeEntityType]?.bg,
                  border: `1px solid ${NODE_COLORS[selectedNode.type as OdeEntityType]?.border}`,
                }}
              >
                <div
                  className="font-semibold mb-1"
                  style={{ color: NODE_COLORS[selectedNode.type as OdeEntityType]?.text }}
                >
                  {selectedNode.label}
                </div>
                <div className="space-y-0.5 text-gray-600">
                  {Object.entries(selectedNode.properties)
                    .filter(([, v]) => v !== null && v !== undefined && v !== "")
                    .map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-2">
                        <span className="text-gray-400 capitalize">{k.replace(/([A-Z])/g, " $1").trim()}</span>
                        <span className="font-medium truncate max-w-[80px]">{String(v)}</span>
                      </div>
                    ))}
                </div>
              </div>
              <button
                onClick={() => setSelectedNode(null)}
                className="mt-1.5 text-xs text-gray-400 hover:text-gray-600 w-full text-left"
              >
                Clear selection
              </button>
            </div>
          )}
        </aside>

        {/* Graph canvas */}
        <main className="flex-1 relative">
          {loading && nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10">
              <div className="text-sm text-gray-500 flex items-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin" />
                Building operational graph…
              </div>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                {error}
              </div>
            </div>
          )}

          {!error && (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={onNodeClick}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              minZoom={0.2}
              maxZoom={2}
              proOptions={{ hideAttribution: true }}
            >
              <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e2e8f0" />
              <Controls showInteractive={false} />
              <MiniMap
                nodeColor={(n) =>
                  NODE_COLORS[(n.data as { entityType: OdeEntityType }).entityType]?.dot ?? "#94a3b8"
                }
                maskColor="rgba(255,255,255,0.8)"
                style={{ border: "1px solid #e2e8f0" }}
              />

              {/* Empty state */}
              {!loading && nodes.length === 0 && (
                <Panel position="top-center">
                  <div className="bg-white border border-gray-200 rounded-lg px-5 py-4 shadow-sm text-center mt-16">
                    <Share2 className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm font-medium text-gray-600">No operational data yet</p>
                    <p className="text-xs text-gray-400 mt-1">
                      Import data via the Data Sources page to populate the graph.
                    </p>
                  </div>
                </Panel>
              )}
            </ReactFlow>
          )}
        </main>
      </div>
    </div>
  );
}

function StatChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white border border-gray-200 rounded-md px-2 py-1.5 text-center">
      <div className="text-sm font-bold text-slate-800">{value}</div>
      <div className="text-[10px] text-gray-400">{label}</div>
    </div>
  );
}
