"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Node, Edge } from "@xyflow/react";
import dagre from "dagre";
import Fuse from "fuse.js";
import type {
  KnowledgeGraphData,
  GraphNode,
  ViewMode,
} from "../types";
import { LAYER_COLORS, EDGE_STYLES, NODE_COLORS } from "../types";

interface ModuleGroup {
  dir: string;
  files: GraphNode[];
  layer: string;
}

function groupByModule(nodes: GraphNode[]): ModuleGroup[] {
  const groups = new Map<string, GraphNode[]>();
  for (const n of nodes) {
    const dir = n.id.includes("/") ? n.id.split("/").slice(0, -1).join("/") : ".";
    const arr = groups.get(dir) ?? [];
    arr.push(n);
    groups.set(dir, arr);
  }
  return Array.from(groups.entries()).map(([dir, files]) => {
    const layerCounts = new Map<string, number>();
    for (const f of files) {
      layerCounts.set(f.layer, (layerCounts.get(f.layer) ?? 0) + 1);
    }
    let dominant = "util";
    let max = 0;
    for (const [l, c] of layerCounts) {
      if (c > max) { dominant = l; max = c; }
    }
    return { dir, files, layer: dominant };
  });
}

function layoutNodes(nodes: Node[], edges: Edge[], direction: "TB" | "LR" = "LR"): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, ranksep: 100, nodesep: 50 });

  for (const n of nodes) {
    g.setNode(n.id, { width: 220, height: 70 });
  }
  for (const e of edges) {
    if (g.hasNode(e.source) && g.hasNode(e.target)) {
      g.setEdge(e.source, e.target);
    }
  }

  dagre.layout(g);

  return nodes.map((n) => {
    const pos = g.node(n.id);
    if (!pos) return n;
    return { ...n, position: { x: pos.x - 110, y: pos.y - 35 } };
  });
}

export function useKnowledgeGraph(bookId: string) {
  const [data, setData] = useState<KnowledgeGraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("file");
  const [coverageFilter, setCoverageFilter] = useState<"all" | "covered" | "uncovered">("all");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [visibleLayers, setVisibleLayers] = useState<Set<string>>(
    new Set(["api", "service", "data", "ui", "infra", "util"])
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [fetchKey, setFetchKey] = useState(0);

  const refetch = useCallback(() => {
    setFetchKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setActiveJobId(null);
    fetch(`/api/books/${bookId}/knowledge-graph`)
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 404 ? "not_found" : `HTTP ${res.status}`);
        return res.json();
      })
      .then((d: KnowledgeGraphData) => {
        if (!cancelled) { setData(d); setError(null); }
      })
      .catch(async (err) => {
        if (cancelled) return;
        if (err.message === "not_found") {
          try {
            const jobRes = await fetch(`/api/books/${bookId}/active-job`);
            if (jobRes.ok && !cancelled) {
              const jobData = await jobRes.json();
              setActiveJobId(jobData.jobId);
            }
          } catch {}
        }
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [bookId, fetchKey]);

  const fuse = useMemo(() => {
    if (!data) return null;
    const items: Array<{ id: string; name: string; summary: string; type: string; layer: string }> = [];
    for (const n of data.nodes) {
      items.push({ id: n.id, name: n.name, summary: n.summary, type: "file", layer: n.layer });
      for (const c of n.children) {
        items.push({ id: c.id, name: c.name, summary: c.summary, type: c.type, layer: n.layer });
        for (const m of c.children) {
          items.push({ id: m.id, name: m.name, summary: m.summary, type: m.type, layer: n.layer });
        }
      }
    }
    return new Fuse(items, { keys: ["name", "summary"], threshold: 0.4 });
  }, [data]);

  const searchResults = useMemo(() => {
    if (!fuse || !searchQuery.trim()) return [];
    return fuse.search(searchQuery, { limit: 10 }).map((r) => r.item);
  }, [fuse, searchQuery]);

  const { rfNodes, rfEdges } = useMemo(() => {
    if (!data) return { rfNodes: [], rfEdges: [] };

    let nodes: Node[] = [];
    let edges: Edge[] = [];

    if (viewMode === "module") {
      const modules = groupByModule(data.nodes.filter((n) => {
        if (!visibleLayers.has(n.layer)) return false;
        const isCovered = (n as any).isCovered !== false;
        if (coverageFilter === "covered" && !isCovered) return false;
        if (coverageFilter === "uncovered" && isCovered) return false;
        return true;
      }));
      nodes = modules.map((m) => {
        const isCovered = m.files.every((f: any) => f.isCovered !== false);
        return {
          id: m.dir,
          type: "moduleNode",
          position: { x: 0, y: 0 },
          data: {
            label: m.dir || "(root)",
            fileCount: m.files.length,
            layer: m.layer,
            color: LAYER_COLORS[m.layer] || "#6b7280",
            isCovered,
          },
        };
      });
      const dirSet = new Set(modules.map((m) => m.dir));
      const edgeSet = new Set<string>();
      for (const e of data.edges) {
        const sDir = e.source.includes("/") ? e.source.split("/").slice(0, -1).join("/") : ".";
        const tDir = e.target.includes("/") ? e.target.split("/").slice(0, -1).join("/") : ".";
        if (sDir !== tDir && dirSet.has(sDir) && dirSet.has(tDir)) {
          const key = `${sDir}→${tDir}`;
          if (!edgeSet.has(key)) {
            edgeSet.add(key);
            edges.push({
              id: key,
              source: sDir,
              target: tDir,
              style: EDGE_STYLES["import"],
              animated: true,
            });
          }
        }
      }
    } else {
      const visible = data.nodes.filter((n) => {
        if (!visibleLayers.has(n.layer)) return false;
        const isCovered = (n as any).isCovered !== false;
        if (coverageFilter === "covered" && !isCovered) return false;
        if (coverageFilter === "uncovered" && isCovered) return false;
        return true;
      });
      const visibleIds = new Set(visible.map((n) => n.id));

      nodes = visible.map((n) => ({
        id: n.id,
        type: "fileNode",
        position: { x: 0, y: 0 },
        data: {
          label: n.name,
type: n.type,
          layer: n.layer,
          language: n.language,
          lineCount: n.line_count,
          summary: n.summary,
          color: NODE_COLORS[n.type] || LAYER_COLORS[n.layer] || "#6b7280",
          childCount: n.children.length,
          selected: n.id === selectedNodeId,
          isCovered: (n as any).isCovered !== false,
        },
      }));

      edges = data.edges
        .filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target))
        .map((e) => ({
          id: `${e.source}→${e.target}`,
          source: e.source,
          target: e.target,
          label: e.label,
          style: EDGE_STYLES[e.type] || EDGE_STYLES["import"],
          animated: e.type === "import",
        }));
    }

    return { rfNodes: layoutNodes(nodes, edges), rfEdges: edges };
  }, [data, viewMode, visibleLayers, selectedNodeId, coverageFilter]);

  const selectedNode = useMemo(() => {
    if (!data || !selectedNodeId) return null;
    return data.nodes.find((n) => n.id === selectedNodeId) ?? null;
  }, [data, selectedNodeId]);

  const toggleLayer = useCallback((layerId: string) => {
    setVisibleLayers((prev) => {
      const next = new Set(prev);
      if (next.has(layerId)) next.delete(layerId);
      else next.add(layerId);
      return next;
    });
  }, []);

  return {
    data,
    loading,
    error,
    activeJobId,
    refetch,
    rfNodes,
    rfEdges,
    viewMode,
    setViewMode,
    coverageFilter,
    setCoverageFilter,
    selectedNodeId,
    setSelectedNodeId: setSelectedNodeId as (id: string | null) => void,
    selectedNode,
    visibleLayers,
    toggleLayer,
    searchQuery,
    setSearchQuery,
    searchResults,
  };
}
