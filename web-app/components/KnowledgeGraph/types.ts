export interface GraphNodeChild {
  id: string;
  type: "class" | "function" | "method" | "constant";
  name: string;
  summary: string;
  signature: string;
  line_start: number;
  line_end: number;
  children: GraphNodeChild[];
}

export interface GraphNode {
  id: string;
  type: "Concept" | "Workflow" | "DataModel" | "Component" | "CodeEntity" | "file" | "directory";
  name: string;
  layer: string;
  summary: string;
  language: string;
  line_count: number;
  imports: Array<{ from: string; names: string[] }>;
  children: GraphNodeChild[];
  metadata?: Record<string, any>;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: "import" | "call" | "extend" | "implement" | "compose" | "IMPLEMENTS" | "MUTATES" | "TRIGGERS" | "DEPENDS_ON" | "DESCRIBES";
  label: string;
  metadata?: Record<string, any>;
}

export interface ArchLayer {
  id: string;
  name: string;
  color: string;
}

export interface TourStep {
  node_id: string;
  narrative: string;
}

export interface GuidedTour {
  id: string;
  name: string;
  description: string;
  steps: TourStep[];
}

export interface KnowledgeGraphStats {
  total_files: number;
  total_functions: number;
  total_classes: number;
  total_edges: number;
}

export interface KnowledgeGraphData {
  version: string;
  repo: string;
  generated_at: string;
  stats: KnowledgeGraphStats;
  layers: ArchLayer[];
  nodes: GraphNode[];
  edges: GraphEdge[];
  tours: GuidedTour[];
  chapter_links: Record<string, string[]>;
}

export type ViewMode = "module" | "file" | "function";

export const LAYER_COLORS: Record<string, string> = {
  api: "#3b82f6",
  service: "#8b5cf6",
  data: "#10b981",
  ui: "#f59e0b",
  infra: "#6b7280",
  util: "#ec4899",
};

export const NODE_COLORS: Record<string, string> = {
  Concept: "#8b5cf6", // Purple
  Workflow: "#3b82f6", // Blue
  DataModel: "#10b981", // Green
  Component: "#f59e0b", // Orange
  CodeEntity: "#6b7280", // Gray
  file: "#6b7280",
  directory: "#6b7280",
};

export const EDGE_STYLES: Record<string, { stroke: string; strokeDasharray?: string }> = {
  import: { stroke: "#64748b" },
  call: { stroke: "#3b82f6", strokeDasharray: "5 3" },
  extend: { stroke: "#8b5cf6", strokeDasharray: "2 2" },
  implement: { stroke: "#10b981", strokeDasharray: "2 2" },
  compose: { stroke: "#f59e0b" },
  IMPLEMENTS: { stroke: "#10b981", strokeDasharray: "3 3" },
  MUTATES: { stroke: "#ef4444" },
  TRIGGERS: { stroke: "#ec4899", strokeDasharray: "4 4" },
  DEPENDS_ON: { stroke: "#64748b" },
  DESCRIBES: { stroke: "#8b5cf6", strokeDasharray: "3 3" },
};

export const LANG_ICONS: Record<string, string> = {
  python: "🐍", typescript: "TS", javascript: "JS", go: "Go",
  rust: "🦀", java: "☕", ruby: "💎", php: "🐘",
  csharp: "C#", cpp: "C++", c: "C", swift: "🍎",
  kotlin: "Kt", html: "🌐", css: "🎨", yaml: "⚙️",
  json: "{}", markdown: "📝", shell: "🐚",
};
