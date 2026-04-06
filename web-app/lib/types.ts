// All types are now derived from Zod schemas in schema.ts
// This file re-exports them for backward compatibility

export type {
  Callout,
  DataTable,
  CodeSnippet,
  MermaidBlock,
  ChapterSection,
  ChapterContent,
  BookStats,
  BookIndexEntry,
  BookIndex,
  ModuleAnalysis,
  CoreType,
  KeyImplementation,
  Architecture,
  ArchitectureLayer,
  Relationships,
  GraphNode,
  GraphEdge,
  ChapterOutline,
  ChapterOutlinePart,
  ChapterOutlineChapter,
  KnowledgeBase,
} from "./schema";
