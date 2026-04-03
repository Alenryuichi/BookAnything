// Types for the book-style knowledge data

export interface Callout {
  type: "tip" | "warning" | "info" | "quote";
  text: string;
}

export interface DataTable {
  caption?: string;
  headers: string[];
  rows: string[][];
}

export interface ChapterContent {
  chapter_id: string;
  title: string;
  subtitle: string;
  chapter_summary?: string;     // 一句话概要（显示为引用框）
  // ── 书的内容（长文叙述） ──
  opening_hook: string;         // 开篇引子 (200-400字)
  sections: ChapterSection[];   // 正文分节 (每节 500-1000字)
  key_takeaways: string[];      // 章末要点
  further_thinking: string[];   // 延伸思考
  // ── 辅助元素 ──
  analogies: string[];          // 比喻
  mermaid_diagrams: MermaidBlock[];  // 架构/流程图
  code_snippets: CodeSnippet[];     // 关键代码 (少量精选)
  // ── 元数据 ──
  word_count: number;
  prerequisites: string[];
}

export interface ChapterSection {
  heading: string;
  content: string;   // 长文叙述，500-1000 字，用 \n\n 分段
  callout?: Callout;       // 关键提示/引用
  table?: DataTable;        // 数据表格
  code?: CodeSnippet;
  diagram?: MermaidBlock;
}

export interface CodeSnippet {
  title: string;
  description: string;  // 代码的上下文说明
  code: string;          // 10-20 行关键代码
  language: string;
  annotation: string;    // 代码后的详细解读
}

export interface MermaidBlock {
  title: string;
  chart: string;
  description: string;
}

// Legacy types kept for backward compatibility
export interface ModuleAnalysis {
  module_id: string;
  module_name: string;
  overview: string;
  design_philosophy: string;
  design_patterns: string[];
  core_types: CoreType[];
  key_implementations: KeyImplementation[];
  dependencies: {
    depends_on: string[];
    depended_by: string[];
  };
  extension_points: string[];
  mermaid_diagram: string;
  layer?: string;
  priority?: number;
  file_count?: number;
  line_count?: number;
}

export interface CoreType {
  name: string;
  purpose: string;
  code: string;
}

export interface KeyImplementation {
  name: string;
  description: string;
  code_snippet: string;
  explanation: string;
}

export interface Architecture {
  layers: ArchitectureLayer[];
  overview_mermaid: string;
  startup_flow: string;
  total_files: number;
  total_lines: number;
}

export interface ArchitectureLayer {
  id: string;
  name: string;
  description: string;
  modules: string[];
  color: string;
}

export interface Relationships {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphNode {
  id: string;
  name: string;
  layer: string;
  size: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  weight: number;
}

export interface KnowledgeBase {
  chapters: Record<string, ChapterContent>;
  modules: Record<string, ModuleAnalysis>;
  architecture: Architecture;
  relationships: Relationships;
}
