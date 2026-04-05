import { z } from "zod";

// ── Callout & Table ──

export const CalloutSchema = z.object({
  type: z.string().default("info"),
  text: z.string().default(""),
});

export const DataTableSchema = z.object({
  caption: z.string().optional(),
  headers: z.array(z.string()).default([]),
  rows: z.array(z.array(z.string())).default([]),
});

// ── Code & Diagram ──

export const CodeSnippetSchema = z.object({
  title: z.string().default(""),
  description: z.string().default(""),
  code: z.string().default(""),
  language: z.string().default("typescript"),
  annotation: z.string().default(""),
});

export const MermaidBlockSchema = z.object({
  title: z.string().default(""),
  chart: z.string().default(""),
  description: z.string().default(""),
});

// ── Coerce helpers for LLM output that may be string instead of object ──

const coerceCodeSnippet = z.preprocess((val) => {
  if (val == null) return undefined;
  if (typeof val === "string") return { title: "", description: "", code: val, language: "typescript", annotation: "" };
  return val;
}, CodeSnippetSchema.optional());

const coerceMermaidBlock = z.preprocess((val) => {
  if (val == null) return undefined;
  if (typeof val === "string") return { title: "", chart: val, description: "" };
  return val;
}, MermaidBlockSchema.optional());

const coerceCallout = z.preprocess((val) => {
  if (val == null) return undefined;
  if (typeof val === "string") return { type: "info", text: val };
  return val;
}, CalloutSchema.optional());

const coerceDataTable = z.preprocess((val) => {
  if (val == null) return undefined;
  if (typeof val === "string") return undefined;
  return val;
}, DataTableSchema.optional());

// ── Chapter Section ──

export const ChapterSectionSchema = z.object({
  heading: z.string().default(""),
  content: z.string().default(""),
  callout: coerceCallout,
  table: coerceDataTable,
  code: coerceCodeSnippet,
  diagram: coerceMermaidBlock,
});

// ── Chapter Content ──

const coerceMermaidArray = z.preprocess((val) => {
  if (!Array.isArray(val)) return [];
  return val.map((item) =>
    typeof item === "string" ? { title: item, chart: "", description: "" } : item,
  );
}, z.array(MermaidBlockSchema).default([]));

const coerceCodeArray = z.preprocess((val) => {
  if (!Array.isArray(val)) return [];
  return val.map((item) =>
    typeof item === "string" ? { title: item, code: "", description: "", language: "typescript", annotation: "" } : item,
  );
}, z.array(CodeSnippetSchema).default([]));

export const ChapterContentSchema = z.object({
  chapter_id: z.string(),
  title: z.string(),
  subtitle: z.string().default(""),
  chapter_summary: z.string().optional(),
  opening_hook: z.string().default(""),
  sections: z.array(ChapterSectionSchema).default([]),
  key_takeaways: z.array(z.string()).default([]),
  further_thinking: z.array(z.string()).default([]),
  analogies: z.array(z.string()).default([]),
  mermaid_diagrams: coerceMermaidArray,
  code_snippets: coerceCodeArray,
  word_count: z.number().default(0),
  prerequisites: z.array(z.string()).default([]),
});

// ── Book Index ──

export const BookStatsSchema = z.object({
  files: z.number().default(0),
  lines: z.number().default(0),
});

export const BookIndexEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  dirName: z.string(),
  description: z.string().default(""),
  language: z.string().default(""),
  chapterCount: z.number().default(0),
  writtenCount: z.number().default(0),
  lastUpdated: z.string().default(""),
  score: z.number().default(0),
  stats: BookStatsSchema.default({ files: 0, lines: 0 }),
});

export const BookIndexSchema = z.object({
  books: z.array(BookIndexEntrySchema).default([]),
});

// ── Legacy Module types ──

export const CoreTypeSchema = z.object({
  name: z.string(),
  purpose: z.string(),
  code: z.string(),
});

export const KeyImplementationSchema = z.object({
  name: z.string(),
  description: z.string(),
  code_snippet: z.string(),
  explanation: z.string(),
});

export const ModuleAnalysisSchema = z.object({
  module_id: z.string(),
  module_name: z.string(),
  overview: z.string(),
  design_philosophy: z.string(),
  design_patterns: z.array(z.string()).default([]),
  core_types: z.array(CoreTypeSchema).default([]),
  key_implementations: z.array(KeyImplementationSchema).default([]),
  dependencies: z.object({
    depends_on: z.array(z.string()).default([]),
    depended_by: z.array(z.string()).default([]),
  }).default({ depends_on: [], depended_by: [] }),
  extension_points: z.array(z.string()).default([]),
  mermaid_diagram: z.string().default(""),
  layer: z.string().optional(),
  priority: z.number().optional(),
  file_count: z.number().optional(),
  line_count: z.number().optional(),
});

export const ArchitectureLayerSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  modules: z.array(z.string()),
  color: z.string(),
});

export const ArchitectureSchema = z.object({
  layers: z.array(ArchitectureLayerSchema).default([]),
  overview_mermaid: z.string().default(""),
  startup_flow: z.string().default(""),
  total_files: z.number().default(0),
  total_lines: z.number().default(0),
});

export const GraphNodeSchema = z.object({
  id: z.string(),
  name: z.string(),
  layer: z.string(),
  size: z.number(),
});

export const GraphEdgeSchema = z.object({
  source: z.string(),
  target: z.string(),
  weight: z.number(),
});

export const RelationshipsSchema = z.object({
  nodes: z.array(GraphNodeSchema).default([]),
  edges: z.array(GraphEdgeSchema).default([]),
});

// ── Inferred types ──

export type Callout = z.infer<typeof CalloutSchema>;
export type DataTable = z.infer<typeof DataTableSchema>;
export type CodeSnippet = z.infer<typeof CodeSnippetSchema>;
export type MermaidBlock = z.infer<typeof MermaidBlockSchema>;
export type ChapterSection = z.infer<typeof ChapterSectionSchema>;
export type ChapterContent = z.infer<typeof ChapterContentSchema>;
export type BookStats = z.infer<typeof BookStatsSchema>;
export type BookIndexEntry = z.infer<typeof BookIndexEntrySchema>;
export type BookIndex = z.infer<typeof BookIndexSchema>;
export type ModuleAnalysis = z.infer<typeof ModuleAnalysisSchema>;
export type CoreType = z.infer<typeof CoreTypeSchema>;
export type KeyImplementation = z.infer<typeof KeyImplementationSchema>;
export type Architecture = z.infer<typeof ArchitectureSchema>;
export type ArchitectureLayer = z.infer<typeof ArchitectureLayerSchema>;
export type Relationships = z.infer<typeof RelationshipsSchema>;
export type GraphNode = z.infer<typeof GraphNodeSchema>;
export type GraphEdge = z.infer<typeof GraphEdgeSchema>;

export interface KnowledgeBase {
  chapters: Record<string, ChapterContent>;
  modules: Record<string, ModuleAnalysis>;
  architecture: Architecture;
  relationships: Relationships;
}

// ── Parser utility ──

function stripMarkdownFence(raw: string): string {
  let cleaned = raw.trim();
  if (cleaned.startsWith("\`\`\`")) {
    cleaned = cleaned
      .replace(/^\`\`\`(?:json)?\s*\n?/, "")
      .replace(/\n?\`\`\`\s*$/, "")
      .trim();
  }
  return cleaned;
}

function extractJsonString(raw: string): string | null {
  const cleaned = stripMarkdownFence(raw);
  if (!cleaned || cleaned.length < 2) return null;

  if (cleaned.startsWith("{")) {
    try { JSON.parse(cleaned); return cleaned; } catch { /* fall through */ }
  }

  const firstBrace = cleaned.indexOf("{");
  if (firstBrace === -1) return null;
  const lastBrace = cleaned.lastIndexOf("}");
  if (lastBrace <= firstBrace) return null;

  const candidate = cleaned.slice(firstBrace, lastBrace + 1);
  try { JSON.parse(candidate); return candidate; } catch { /* fall through */ }

  for (let end = lastBrace; end > firstBrace; end--) {
    if (cleaned[end] === "}") {
      const sub = cleaned.slice(firstBrace, end + 1);
      try { JSON.parse(sub); return sub; } catch { continue; }
    }
  }
  return null;
}

export function parseChapterJson(raw: string): ChapterContent | null {
  const jsonStr = extractJsonString(raw);
  if (!jsonStr) return null;
  try {
    const data = JSON.parse(jsonStr);
    const target = data.type === "result" && typeof data.result === "string"
      ? JSON.parse(extractJsonString(data.result) || "{}")
      : data;
    const result = ChapterContentSchema.safeParse(target);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function parseBookIndex(raw: string): BookIndex {
  try {
    const data = JSON.parse(raw);
    const result = BookIndexSchema.safeParse(data);
    return result.success ? result.data : { books: [] };
  } catch {
    return { books: [] };
  }
}
