import fs from "fs";
import path from "path";
import {
  parseChapterJson,
  parseBookIndex,
  ArchitectureSchema,
  RelationshipsSchema,
} from "./schema";
import type {
  ModuleAnalysis,
  ChapterContent,
  Architecture,
  Relationships,
  KnowledgeBase,
  BookIndex,
} from "./types";

const KNOWLEDGE_ROOT = path.join(process.cwd(), "..", "knowledge");
const PROJECTS_DIR = path.join(process.cwd(), "..", "projects");

// ── Book index ──

export function loadBookIndex(): BookIndex {
  const indexPath = path.join(KNOWLEDGE_ROOT, "index.json");
  if (!fs.existsSync(indexPath)) return { books: [] };
  try {
    const raw = fs.readFileSync(indexPath, "utf-8");
    return parseBookIndex(raw);
  } catch {
    return { books: [] };
  }
}

export function invalidateIndexCache(): void {
  // No-op, cache removed to avoid Next.js cross-worker stale data
}

export function resolveBookDir(bookId: string): string | null {
  const index = loadBookIndex();
  const entry = index.books.find((b) => b.id === bookId);
  if (!entry) return null;
  const dir = path.join(KNOWLEDGE_ROOT, entry.dirName);
  return fs.existsSync(dir) ? dir : null;
}

// ── Module normalization helpers ──
// Kept because LLM-generated module JSON is often structurally messy
// (objects where strings are expected, etc.) and Zod strict parsing rejects it.

function extractJson(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length < 2) return null;

  let cleaned = trimmed;
  if (cleaned.startsWith("```")) {
    cleaned = cleaned
      .replace(/^```(?:json)?\s*\n?/, "")
      .replace(/\n?```\s*$/, "")
      .trim();
  }

  if (cleaned.startsWith("{")) {
    try {
      JSON.parse(cleaned);
      return cleaned;
    } catch {
      // fall through
    }
  }

  const firstBrace = cleaned.indexOf("{");
  if (firstBrace === -1) return null;
  const lastBrace = cleaned.lastIndexOf("}");
  if (lastBrace === -1 || lastBrace <= firstBrace) return null;

  const candidate = cleaned.slice(firstBrace, lastBrace + 1);
  try {
    JSON.parse(candidate);
    return candidate;
  } catch {
    for (let end = lastBrace; end > firstBrace; end--) {
      if (cleaned[end] === "}") {
        const sub = cleaned.slice(firstBrace, end + 1);
        try {
          JSON.parse(sub);
          return sub;
        } catch {
          continue;
        }
      }
    }
  }
  return null;
}

function isValidModule(data: unknown): data is ModuleAnalysis {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return !!(
    (typeof d.overview === "string" && d.overview.length > 10) ||
    (typeof d.module_name === "string" && d.module_name.length > 0)
  );
}

function toStr(val: unknown): string {
  if (typeof val === "string") return val;
  if (val === null || val === undefined) return "";
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  if (Array.isArray(val)) return val.map(toStr).join(", ");
  if (typeof val === "object") {
    const o = val as Record<string, unknown>;
    const parts: string[] = [];
    for (const [, v] of Object.entries(o)) {
      if (typeof v === "string" && v.length > 0) parts.push(v);
      else if (typeof v === "object" && v !== null) parts.push(toStr(v));
    }
    return parts.join(" - ") || JSON.stringify(val);
  }
  return String(val);
}

function toStringArray(arr: unknown): string[] {
  if (!Array.isArray(arr)) return [];
  return arr.map((item) => {
    if (typeof item === "string") return item;
    if (typeof item === "object" && item !== null) {
      const o = item as Record<string, unknown>;
      const name = o.name || o.module || "";
      const desc = o.description || o.purpose || o.reason || o.path || "";
      return [name, desc].filter(Boolean).join(": ");
    }
    return String(item);
  });
}

function normalizeDeps(
  deps: unknown,
): { depends_on: string[]; depended_by: string[] } {
  if (!deps || typeof deps !== "object")
    return { depends_on: [], depended_by: [] };
  const d = deps as Record<string, unknown>;
  return {
    depends_on: toStringArray(d.depends_on),
    depended_by: toStringArray(d.depended_by),
  };
}

function normalizeModule(data: any, id: string): ModuleAnalysis {
  return {
    ...data,
    module_id: data.module_id || id,
    module_name: toStr(data.module_name) || id,
    overview: toStr(data.overview),
    design_philosophy: toStr(data.design_philosophy),
    design_patterns: toStringArray(data.design_patterns),
    core_types: Array.isArray(data.core_types)
      ? data.core_types.map((t: any) => ({
          name: toStr(t?.name),
          purpose: toStr(t?.purpose),
          code: toStr(t?.code),
        }))
      : [],
    key_implementations: Array.isArray(data.key_implementations)
      ? data.key_implementations.map((t: any) => ({
          name: toStr(t?.name),
          description: toStr(t?.description),
          code_snippet: toStr(t?.code_snippet || t?.code),
          explanation: toStr(t?.explanation),
        }))
      : [],
    extension_points: toStringArray(data.extension_points),
    dependencies: normalizeDeps(data.dependencies),
    mermaid_diagram:
      typeof data.mermaid_diagram === "string" ? data.mermaid_diagram : "",
  };
}

// ── Project YAML helpers ──

function findProjectYaml(bookId: string): string | null {
  if (!fs.existsSync(PROJECTS_DIR)) return null;

  const index = loadBookIndex();
  const entry = index.books.find((b) => b.id === bookId);

  const yamlFiles = fs
    .readdirSync(PROJECTS_DIR)
    .filter((f) => f.endsWith(".yaml") && f !== "example.yaml");
  if (yamlFiles.length === 0) return null;

  if (entry) {
    const byDir = yamlFiles.find(
      (f) => f.replace(".yaml", "") === entry.dirName,
    );
    if (byDir) return path.join(PROJECTS_DIR, byDir);

    const byId = yamlFiles.find((f) => f.replace(".yaml", "") === bookId);
    if (byId) return path.join(PROJECTS_DIR, byId);

    for (const f of yamlFiles) {
      try {
        const content = fs.readFileSync(path.join(PROJECTS_DIR, f), "utf-8");
        const titleMatch = content.match(/^\s+title:\s*"?(.+?)"?\s*$/m);
        if (titleMatch && titleMatch[1] === entry.name) {
          return path.join(PROJECTS_DIR, f);
        }
      } catch {
        // skip unreadable files
      }
    }
  }

  const byId = yamlFiles.find((f) => f.replace(".yaml", "") === bookId);
  if (byId) return path.join(PROJECTS_DIR, byId);

  return null;
}

function readProjectYaml(bookId: string): string | null {
  const yamlPath = findProjectYaml(bookId);
  if (!yamlPath) return null;
  try {
    return fs.readFileSync(yamlPath, "utf-8");
  } catch {
    return null;
  }
}

// ── Public API ──

export function loadChapters(
  bookId: string,
): Record<string, ChapterContent> {
  const bookDir = resolveBookDir(bookId);
  if (!bookDir) return {};

  const chaptersDir = path.join(bookDir, "chapters");
  if (!fs.existsSync(chaptersDir)) return {};

  const result: Record<string, ChapterContent> = {};
  const files = fs.readdirSync(chaptersDir).filter((f) => f.endsWith(".json"));

  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(chaptersDir, file), "utf-8");
      const chapter = parseChapterJson(raw);
      if (!chapter) continue;
      const id = file.replace(".json", "");
      result[id] = { ...chapter, chapter_id: chapter.chapter_id || id };
    } catch {
      // skip broken files
    }
  }
  return result;
}

export function loadModules(
  bookId: string,
): Record<string, ModuleAnalysis> {
  const bookDir = resolveBookDir(bookId);
  if (!bookDir) return {};

  const modulesDir = path.join(bookDir, "modules");
  if (!fs.existsSync(modulesDir)) return {};

  const result: Record<string, ModuleAnalysis> = {};
  const files = fs.readdirSync(modulesDir).filter((f) => f.endsWith(".json"));

  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(modulesDir, file), "utf-8");
      const jsonStr = extractJson(raw);
      if (!jsonStr) continue;

      let data = JSON.parse(jsonStr);

      if (data.type === "result" && typeof data.result === "string") {
        const innerJson = extractJson(data.result);
        if (!innerJson) continue;
        data = JSON.parse(innerJson);
      }

      if (!isValidModule(data)) continue;
      const id = file.replace(".json", "");
      result[id] = normalizeModule(data, id);
    } catch {
      // skip broken files
    }
  }
  return result;
}

export function loadArchitecture(bookId: string): Architecture {
  const fallback: Architecture = {
    layers: [],
    overview_mermaid: "",
    startup_flow: "",
    total_files: 0,
    total_lines: 0,
  };

  const bookDir = resolveBookDir(bookId);
  if (!bookDir) return fallback;

  const filePath = path.join(bookDir, "architecture.json");
  if (!fs.existsSync(filePath)) return fallback;

  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const jsonStr = extractJson(raw);
    if (!jsonStr) return fallback;
    const data = JSON.parse(jsonStr);
    const result = ArchitectureSchema.safeParse(data);
    return result.success ? result.data : fallback;
  } catch {
    return fallback;
  }
}

export function loadRelationships(bookId: string): Relationships {
  const fallback: Relationships = { nodes: [], edges: [] };

  const bookDir = resolveBookDir(bookId);
  if (!bookDir) return fallback;

  const filePath = path.join(bookDir, "relationships.json");
  if (!fs.existsSync(filePath)) return fallback;

  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const jsonStr = extractJson(raw);
    if (!jsonStr) return fallback;
    const data = JSON.parse(jsonStr);
    const result = RelationshipsSchema.safeParse(data);
    return result.success ? result.data : fallback;
  } catch {
    return fallback;
  }
}

export function loadKnowledge(bookId: string): KnowledgeBase {
  return {
    chapters: loadChapters(bookId),
    modules: loadModules(bookId),
    architecture: loadArchitecture(bookId),
    relationships: loadRelationships(bookId),
  };
}

export function loadBookTitle(bookId: string): string {
  const index = loadBookIndex();
  const entry = index.books.find((b) => b.id === bookId);
  return entry?.name || bookId;
}

export function loadBookStats(
  bookId: string,
): { files: number; lines: number } {
  const index = loadBookIndex();
  const entry = index.books.find((b) => b.id === bookId);
  return entry?.stats ?? { files: 0, lines: 0 };
}

export function loadChapterIds(bookId: string): string[] {
  const content = readProjectYaml(bookId);
  if (content) {
    const ids: string[] = [];
    for (const match of content.matchAll(/^\s+- id:\s*(.+)/gm)) {
      const id = match[1].trim().replace(/^["']|["']$/g, "");
      if (id) ids.push(id);
    }
    if (ids.length > 0) return ids;
  }

  const bookDir = resolveBookDir(bookId);
  if (!bookDir) return [];
  const chaptersDir = path.join(bookDir, "chapters");
  if (!fs.existsSync(chaptersDir)) return [];
  return fs
    .readdirSync(chaptersDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(".json", ""))
    .sort();
}

export function loadParts(
  bookId: string,
): { name: string; color: string; ids: string[] }[] {
  const content = readProjectYaml(bookId);
  if (!content) return [];

  const parts: { name: string; color: string; ids: string[] }[] = [];
  const colors = [
    "#3b82f6",
    "#06b6d4",
    "#10b981",
    "#f59e0b",
    "#ef4444",
    "#8b5cf6",
    "#ec4899",
    "#14b8a6",
  ];
  let currentPart: { name: string; color: string; ids: string[] } | null =
    null;
  let colorIdx = 0;

  for (const line of content.split("\n")) {
    const partMatch = line.match(
      /^\s+#\s+(?:Part\s+\d+\s*[-\u2013\u2014]\s*)?(.+)/,
    );
    if (partMatch && !line.includes("\u2500\u2500\u2500\u2500\u2500\u2500")) {
      if (currentPart && currentPart.ids.length > 0) {
        parts.push(currentPart);
      }
      currentPart = {
        name: partMatch[1].trim(),
        color: colors[colorIdx % colors.length],
        ids: [],
      };
      colorIdx++;
      continue;
    }
    const idMatch = line.match(/^\s+- id:\s*(.+)/);
    if (idMatch) {
      const id = idMatch[1].trim().replace(/^["']|["']$/g, "");
      if (currentPart) {
        currentPart.ids.push(id);
      } else {
        currentPart = { name: "\u7ae0\u8282", color: colors[0], ids: [id] };
      }
    }
  }
  if (currentPart && currentPart.ids.length > 0) {
    parts.push(currentPart);
  }
  return parts;
}
