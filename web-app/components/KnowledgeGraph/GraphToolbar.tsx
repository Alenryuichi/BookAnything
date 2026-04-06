"use client";

import { Search } from "lucide-react";
import type { ViewMode, ArchLayer } from "./types";
import { LAYER_COLORS } from "./types";

interface Props {
  viewMode: ViewMode;
  setViewMode: (m: ViewMode) => void;
  layers: ArchLayer[];
  visibleLayers: Set<string>;
  toggleLayer: (id: string) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  searchResults: Array<{ id: string; name: string; type: string; layer: string }>;
  onSearchSelect: (id: string) => void;
  stats: { total_files: number; total_functions: number; total_classes: number; total_edges: number } | null;
  tourCount: number;
  onStartTour: () => void;
  coverageFilter: "all" | "covered" | "uncovered";
  setCoverageFilter: (f: "all" | "covered" | "uncovered") => void;
}

const VIEW_LABELS: Record<ViewMode, string> = {
  module: "Module",
  file: "File",
  function: "Function",
};

export function GraphToolbar({
  viewMode, setViewMode, layers, visibleLayers, toggleLayer,
  searchQuery, setSearchQuery, searchResults, onSearchSelect,
  stats, tourCount, onStartTour,
  coverageFilter, setCoverageFilter,
}: Props) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-muted/30 flex-wrap">
      {/* View mode */}
      <div className="flex items-center rounded-lg border border-border overflow-hidden">
        {(["module", "file", "function"] as ViewMode[]).map((m) => (
          <button
            key={m}
            onClick={() => setViewMode(m)}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
              viewMode === m
                ? "bg-foreground text-background"
                : "hover:bg-muted text-muted-foreground"
            }`}
          >
            {VIEW_LABELS[m]}
          </button>
        ))}
      </div>

      {/* Coverage Filter */}
      <div className="flex items-center rounded-lg border border-border overflow-hidden">
        <button
          onClick={() => setCoverageFilter("all")}
          className={`px-3 py-1.5 text-xs font-medium transition-colors ${coverageFilter === "all" ? "bg-foreground text-background" : "hover:bg-muted text-muted-foreground"}`}
        >All</button>
        <button
          onClick={() => setCoverageFilter("covered")}
          className={`px-3 py-1.5 text-xs font-medium transition-colors border-l border-border ${coverageFilter === "covered" ? "bg-green-600 text-white" : "hover:bg-muted text-muted-foreground"}`}
        >Covered</button>
        <button
          onClick={() => setCoverageFilter("uncovered")}
          className={`px-3 py-1.5 text-xs font-medium transition-colors border-l border-border ${coverageFilter === "uncovered" ? "bg-red-600 text-white" : "hover:bg-muted text-muted-foreground"}`}
        >Missing</button>
      </div>

      {/* Layer filters */}
      <div className="flex items-center gap-1.5">
        {layers.map((l) => {
          const active = visibleLayers.has(l.id);
          return (
            <button
              key={l.id}
              onClick={() => toggleLayer(l.id)}
              className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium transition-all border ${
                active
                  ? "border-transparent"
                  : "border-transparent opacity-40 grayscale"
              }`}
              style={active ? { backgroundColor: LAYER_COLORS[l.id] + "20", color: LAYER_COLORS[l.id] } : {}}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: LAYER_COLORS[l.id] }}
              />
              {l.name.replace(" Layer", "")}
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative ml-auto">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search symbols..."
          className="pl-8 pr-3 py-1.5 text-xs bg-background border border-border rounded-lg w-52 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        {searchResults.length > 0 && searchQuery && (
          <div className="absolute top-full mt-1 left-0 right-0 bg-background border border-border rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
            {searchResults.map((r) => (
              <button
                key={r.id}
                onClick={() => { onSearchSelect(r.id); setSearchQuery(""); }}
                className="flex items-center gap-2 w-full px-3 py-2 text-left text-xs hover:bg-muted transition-colors"
              >
                <span className="text-muted-foreground">{r.type === "class" ? "⬡" : r.type === "function" ? "ƒ" : "📄"}</span>
                <span className="font-medium truncate">{r.name}</span>
                <span
                  className="w-2 h-2 rounded-full shrink-0 ml-auto"
                  style={{ backgroundColor: LAYER_COLORS[r.layer] }}
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Tour button */}
      {tourCount > 0 && (
        <button
          onClick={onStartTour}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border hover:bg-muted transition-colors"
        >
          🧭 Tours ({tourCount})
        </button>
      )}

      {/* Stats */}
      {stats && (
        <div className="text-[10px] text-muted-foreground hidden md:block">
          {stats.total_files}F · {stats.total_classes}C · {stats.total_functions}ƒ · {stats.total_edges}E
        </div>
      )}
    </div>
  );
}
