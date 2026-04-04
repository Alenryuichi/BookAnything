import fs from "fs";
import path from "path";
import type {
  ModuleAnalysis,
  ChapterContent,
  Architecture,
  Relationships,
  KnowledgeBase,
} from "./types";

// Load project name from environment variable or detect from project YAML files
function getKnowledgeProject(): string {
  // 1. Check environment variable first
  if (process.env.KNOWLEDGE_PROJECT) {
    return process.env.KNOWLEDGE_PROJECT;
  }

  // 2. Try to determine from project YAML file
  const projectDir = path.join(process.cwd(), "..", "projects");
  if (fs.existsSync(projectDir)) {
    const yamlFiles = fs.readdirSync(projectDir).filter(f => f.endsWith(".yaml") && f !== "example.yaml");

    // If PROJECT_YAML is set, read the name from that file
    const envYaml = process.env.PROJECT_YAML;
    if (envYaml) {
      const fullPath = path.isAbsolute(envYaml) ? envYaml : path.join(projectDir, envYaml);
      try {
        const content = fs.readFileSync(fullPath, "utf-8");
        const nameMatch = content.match(/^name:\s*"?(.+?)"?\s*$/m);
        if (nameMatch) return nameMatch[1];
      } catch {}
    }

    // Otherwise read from the first non-example YAML
    if (yamlFiles.length > 0) {
      try {
        const content = fs.readFileSync(path.join(projectDir, yamlFiles[0]), "utf-8");
        const nameMatch = content.match(/^name:\s*"?(.+?)"?\s*$/m);
        if (nameMatch) return nameMatch[1];
      } catch {}
    }
  }

  // 3. Fallback: check available directories in knowledge/
  const knowledgeDir = path.join(process.cwd(), "..", "knowledge");
  if (fs.existsSync(knowledgeDir)) {
    const subdirs = fs.readdirSync(knowledgeDir).filter(f => {
      const fullPath = path.join(knowledgeDir, f);
      return fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory() && f !== "chapters" && f !== "modules";
    });
    if (subdirs.length > 0) {
      return subdirs[0]; // Use the first available subdirectory
    }
  }

  // 4. Fallback: check if we have chapters in flat knowledge/ dir
  const chaptersDir = path.join(knowledgeDir, "chapters");
  if (fs.existsSync(chaptersDir)) {
    const chapterFiles = fs.readdirSync(chaptersDir).filter(f => f.endsWith(".json"));
    if (chapterFiles.length > 0) {
      return "Claude Code"; // Use default project name for flat structure
    }
  }

  // 5. Final fallback
  return "Claude Code";
}

const KNOWLEDGE_PROJECT = getKnowledgeProject();
const KNOWLEDGE_DIR_PROJECT = path.join(process.cwd(), "..", "knowledge", KNOWLEDGE_PROJECT);
// Fallback to legacy flat knowledge/ dir if project-namespaced dir doesn't exist
const KNOWLEDGE_DIR = fs.existsSync(KNOWLEDGE_DIR_PROJECT)
  ? KNOWLEDGE_DIR_PROJECT
  : path.join(process.cwd(), "..", "knowledge");

console.log("Knowledge directory:", KNOWLEDGE_DIR);
console.log("Project name:", KNOWLEDGE_PROJECT);

/**
 * Extract JSON from text that may have leading prose or ```json wrapping.
 * Handles:
 *   - Pure JSON: { ... }
 *   - Markdown wrapped: ```json\n{ ... }\n```
 *   - Prose prefix: "基于分析...\n\n{ ... }"
 *   - Raw claude output envelope: {"type":"result",...,"result":"{ ... }"}
 */
function extractJson(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length < 2) return null;

  // Strip ```json ... ``` wrapping
  let cleaned = trimmed;
  if (cleaned.startsWith("```")) {
    cleaned = cleaned
      .replace(/^```(?:json)?\s*\n?/, "")
      .replace(/\n?```\s*$/, "")
      .trim();
  }

  // If it's already valid JSON starting with {, try directly
  if (cleaned.startsWith("{")) {
    try {
      JSON.parse(cleaned);
      return cleaned;
    } catch {
      // might have trailing garbage, try to find matching brace
    }
  }

  // Find the first { and try to extract the largest valid JSON object
  const firstBrace = cleaned.indexOf("{");
  if (firstBrace === -1) return null;

  // Try from the first { to the last }
  const lastBrace = cleaned.lastIndexOf("}");
  if (lastBrace === -1 || lastBrace <= firstBrace) return null;

  const candidate = cleaned.slice(firstBrace, lastBrace + 1);
  try {
    JSON.parse(candidate);
    return candidate;
  } catch {
    // Nested braces may cause issues, try progressively shorter substrings
    // from the end
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

function readJsonSafe<T>(filePath: string, fallback: T): T {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const jsonStr = extractJson(raw);
    if (!jsonStr) return fallback;
    const parsed = JSON.parse(jsonStr);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      Object.keys(parsed).length === 0
    ) {
      return fallback;
    }
    return parsed as T;
  } catch {
    return fallback;
  }
}

/** Minimum fields a module analysis must have to be considered valid */
function isValidModule(data: unknown): data is ModuleAnalysis {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  // Must have at least an overview or module_name
  return !!(
    (typeof d.overview === "string" && d.overview.length > 10) ||
    (typeof d.module_name === "string" && d.module_name.length > 0)
  );
}

/** Flatten any value to a renderable string */
function toStr(val: unknown): string {
  if (typeof val === "string") return val;
  if (val === null || val === undefined) return "";
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  if (Array.isArray(val)) return val.map(toStr).join(", ");
  if (typeof val === "object") {
    // Try to make a sensible string from object keys
    const o = val as Record<string, unknown>;
    const parts: string[] = [];
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === "string" && v.length > 0) parts.push(v);
      else if (typeof v === "object" && v !== null) parts.push(toStr(v));
    }
    return parts.join(" - ") || JSON.stringify(val);
  }
  return String(val);
}

/** Flatten any object to string - handles Claude outputting objects where strings expected */
function toStringArray(arr: unknown): string[] {
  if (!Array.isArray(arr)) return [];
  return arr.map((item) => {
    if (typeof item === "string") return item;
    if (typeof item === "object" && item !== null) {
      // e.g. {name: "X", description: "Y"} → "X: Y"
      const o = item as Record<string, unknown>;
      const name = o.name || o.module || "";
      const desc = o.description || o.purpose || o.reason || o.path || "";
      return [name, desc].filter(Boolean).join(": ");
    }
    return String(item);
  });
}

/** Normalize dependencies to string arrays */
function normalizeDeps(deps: unknown): { depends_on: string[]; depended_by: string[] } {
  if (!deps || typeof deps !== "object") return { depends_on: [], depended_by: [] };
  const d = deps as Record<string, unknown>;
  return {
    depends_on: toStringArray(d.depends_on),
    depended_by: toStringArray(d.depended_by),
  };
}

export function loadModules(): Record<string, ModuleAnalysis> {
  const modulesDir = path.join(KNOWLEDGE_DIR, "modules");
  const result: Record<string, ModuleAnalysis> = {};

  if (!fs.existsSync(modulesDir)) return result;

  const files = fs.readdirSync(modulesDir).filter((f) => f.endsWith(".json"));
  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(modulesDir, file), "utf-8");
      const jsonStr = extractJson(raw);
      if (!jsonStr) continue;

      const data = JSON.parse(jsonStr);

      // Handle claude output envelope: {"type":"result",...}
      if (data.type === "result" && typeof data.result === "string") {
        const innerJson = extractJson(data.result);
        if (!innerJson) continue;
        const inner = JSON.parse(innerJson);
        if (!isValidModule(inner)) continue;
        const id = file.replace(".json", "");
        result[id] = {
          ...inner,
          module_id: inner.module_id || id,
          module_name: toStr(inner.module_name) || id,
          overview: toStr(inner.overview),
          design_philosophy: toStr(inner.design_philosophy),
          design_patterns: toStringArray(inner.design_patterns),
          core_types: Array.isArray(inner.core_types)
            ? inner.core_types.map((t: any) => ({
                name: toStr(t?.name), purpose: toStr(t?.purpose), code: toStr(t?.code),
              }))
            : [],
          key_implementations: Array.isArray(inner.key_implementations)
            ? inner.key_implementations.map((t: any) => ({
                name: toStr(t?.name), description: toStr(t?.description),
                code_snippet: toStr(t?.code_snippet || t?.code), explanation: toStr(t?.explanation),
              }))
            : [],
          extension_points: toStringArray(inner.extension_points),
          dependencies: normalizeDeps(inner.dependencies),
          mermaid_diagram: typeof inner.mermaid_diagram === "string" ? inner.mermaid_diagram : "",
        };
        continue;
      }

      if (!isValidModule(data)) continue;

      const id = file.replace(".json", "");
      result[id] = {
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
        mermaid_diagram: typeof data.mermaid_diagram === "string" ? data.mermaid_diagram : "",
      };
    } catch {
      // skip truly broken files
    }
  }
  return result;
}

export function loadArchitecture(): Architecture {
  return readJsonSafe<Architecture>(
    path.join(KNOWLEDGE_DIR, "architecture.json"),
    {
      layers: [
        {
          id: "entry",
          name: "入口层",
          description: "应用启动入口和初始化",
          modules: ["core-entry", "entrypoints", "bootstrap"],
          color: "#3b82f6",
        },
        {
          id: "cli",
          name: "CLI 层",
          description: "命令行交互和命令处理",
          modules: ["cli", "commands"],
          color: "#8b5cf6",
        },
        {
          id: "logic",
          name: "逻辑层",
          description: "核心业务逻辑和工具编排",
          modules: [
            "tools-core",
            "tools-file",
            "tools-exec",
            "tools-agent",
            "tools-task",
            "tools-plan",
            "tools-web",
            "tools-mcp",
            "tools-misc",
          ],
          color: "#06b6d4",
        },
        {
          id: "engine",
          name: "引擎层",
          description: "任务调度、查询引擎、Agent协调",
          modules: ["tasks", "query-engine", "coordinator"],
          color: "#10b981",
        },
        {
          id: "ui",
          name: "UI 层",
          description: "终端界面渲染和状态管理",
          modules: [
            "components",
            "ink-framework",
            "screens",
            "hooks",
            "state",
            "context-providers",
          ],
          color: "#f59e0b",
        },
        {
          id: "infra",
          name: "基础设施层",
          description: "通信、服务、工具函数",
          modules: [
            "services",
            "bridge",
            "server",
            "remote",
            "utils",
            "types",
            "constants",
          ],
          color: "#ef4444",
        },
      ],
      overview_mermaid: "",
      startup_flow: "",
      total_files: 1900,
      total_lines: 512000,
    }
  );
}

export function loadRelationships(): Relationships {
  return readJsonSafe<Relationships>(
    path.join(KNOWLEDGE_DIR, "relationships.json"),
    { nodes: [], edges: [] }
  );
}

export function loadChapters(): Record<string, ChapterContent> {
  const chaptersDir = path.join(KNOWLEDGE_DIR, "chapters");
  const result: Record<string, ChapterContent> = {};

  if (!fs.existsSync(chaptersDir)) return result;

  const files = fs.readdirSync(chaptersDir).filter((f) => f.endsWith(".json"));
  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(chaptersDir, file), "utf-8");
      const jsonStr = extractJson(raw);
      if (!jsonStr) continue;
      const data = JSON.parse(jsonStr);
      // Must have at least title and some content
      if (!data.title && !data.opening_hook) continue;
      const id = file.replace(".json", "");
      // Normalize sections with robust error handling
      let sections: any[] = [];
      try {
        if (Array.isArray(data.sections)) {
          sections = data.sections.map((s: any) => ({
            heading: toStr(s?.heading),
            content: toStr(s?.content),
            callout: s?.callout ? {
              type: (s.callout?.type as string) || "info",
              text: toStr(s.callout?.text),
            } : undefined,
            table: s?.table ? {
              caption: toStr(s.table?.caption),
              headers: toStringArray(s.table?.headers),
              rows: Array.isArray(s.table?.rows) ? s.table.rows.map((r: any) => toStringArray(r)) : [],
            } : undefined,
            code: s?.code ? {
              title: toStr(s.code?.title),
              description: toStr(s.code?.description),
              code: toStr(s.code?.code),
              language: toStr(s.code?.language || "typescript"),
              annotation: toStr(s.code?.annotation),
            } : undefined,
            diagram: s?.diagram ? {
              title: toStr(s.diagram?.title),
              chart: toStr(s.diagram?.chart),
              description: toStr(s.diagram?.description),
            } : undefined,
          }));
        } else if (data.sections && typeof data.sections === "object") {
          // Handle case where sections might be an object instead of array
          sections = Object.entries(data.sections).map(([key, value]: [string, any]) => ({
            heading: toStr(value?.heading) || key,
            content: toStr(value?.content),
            callout: value?.callout ? {
              type: (value.callout?.type as string) || "info",
              text: toStr(value.callout?.text),
            } : undefined,
            table: value?.table ? {
              caption: toStr(value.table?.caption),
              headers: toStringArray(value.table?.headers),
              rows: Array.isArray(value.table?.rows) ? value.table.rows.map((r: any) => toStringArray(r)) : [],
            } : undefined,
            code: value?.code ? {
              title: toStr(value.code?.title),
              description: toStr(value.code?.description),
              code: toStr(value.code?.code),
              language: toStr(value.code?.language || "typescript"),
              annotation: toStr(value.code?.annotation),
            } : undefined,
            diagram: value?.diagram ? {
              title: toStr(value.diagram?.title),
              chart: toStr(value.diagram?.chart),
              description: toStr(value.diagram?.description),
            } : undefined,
          }));
        }
      } catch (sectionError) {
        console.warn(`Failed to parse sections for chapter ${id}:`, sectionError);
        sections = [];
      }

      result[id] = {
        ...data,
        chapter_id: data.chapter_id || id,
        title: toStr(data.title) || id,
        subtitle: toStr(data.subtitle) || "",
        chapter_summary: toStr(data.chapter_summary) || "",
        opening_hook: toStr(data.opening_hook) || "",
        sections,
        key_takeaways: toStringArray(data.key_takeaways),
        further_thinking: toStringArray(data.further_thinking),
        analogies: toStringArray(data.analogies),
        mermaid_diagrams: Array.isArray(data.mermaid_diagrams) ? data.mermaid_diagrams : [],
        code_snippets: Array.isArray(data.code_snippets) ? data.code_snippets : [],
        word_count: typeof data.word_count === "number" ? data.word_count : 0,
        prerequisites: toStringArray(data.prerequisites),
      };
    } catch {
      // skip broken files
    }
  }
  return result;
}

/** Load book title from project YAML */
export function loadBookTitle(): string {
  const content = readFirstProjectYaml();
  if (!content) return "深入理解";
  const match = content.match(/^\s+title:\s*"?(.+?)"?\s*$/m);
  return match ? match[1] : "深入理解";
}

/** Load book stats (files, lines) from project YAML */
export function loadBookStats(): { files: number; lines: number } {
  const content = readFirstProjectYaml();
  if (!content) return { files: 0, lines: 0 };
  const filesMatch = content.match(/files:\s*(\d+)/);
  const linesMatch = content.match(/lines:\s*(\d+)/);
  return {
    files: filesMatch ? parseInt(filesMatch[1], 10) : 0,
    lines: linesMatch ? parseInt(linesMatch[1], 10) : 0,
  };
}

/** Helper: read the project YAML file content. Respects PROJECT_YAML env var. */
function readFirstProjectYaml(): string | null {
  const projectDir = path.join(process.cwd(), "..", "projects");
  if (!fs.existsSync(projectDir)) return null;

  // If PROJECT_YAML is set, use that specific file
  const envYaml = process.env.PROJECT_YAML;
  if (envYaml) {
    const fullPath = path.isAbsolute(envYaml) ? envYaml : path.join(projectDir, envYaml);
    try { return fs.readFileSync(fullPath, "utf-8"); } catch { return null; }
  }

  // Otherwise pick the first non-example yaml
  const yamlFiles = fs.readdirSync(projectDir).filter((f) => f.endsWith(".yaml") && f !== "example.yaml");
  if (yamlFiles.length === 0) return null;
  try {
    return fs.readFileSync(path.join(projectDir, yamlFiles[0]), "utf-8");
  } catch {
    return null;
  }
}

export function loadKnowledge(): KnowledgeBase {
  return {
    chapters: loadChapters(),
    modules: loadModules(),
    architecture: loadArchitecture(),
    relationships: loadRelationships(),
  };
}

/** Load chapter IDs from the project YAML or from existing chapter JSON files */
export function loadChapterIds(): string[] {
  const content = readFirstProjectYaml();
  if (content) {
    const ids: string[] = [];
    for (const match of content.matchAll(/^\s+- id:\s*(.+)/gm)) {
      const id = match[1].trim().replace(/^["']|["']$/g, "");
      if (id) ids.push(id);
    }
    if (ids.length > 0) return ids;
  }
  // Fallback: read from existing chapter JSON files
  const chaptersDir = path.join(KNOWLEDGE_DIR, "chapters");
  if (!fs.existsSync(chaptersDir)) return [];
  return fs.readdirSync(chaptersDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(".json", ""))
    .sort();
}

/** Load Part groupings from the project YAML */
export function loadParts(): { name: string; color: string; ids: string[] }[] {
  const content = readFirstProjectYaml();
  if (!content) return [];

  const parts: { name: string; color: string; ids: string[] }[] = [];
  const colors = ["#3b82f6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6"];
  let currentPart: { name: string; color: string; ids: string[] } | null = null;
  let colorIdx = 0;

  for (const line of content.split("\n")) {
    // Detect Part comment: "  # Part N - Title" or "  # Title"
    const partMatch = line.match(/^\s+#\s+(?:Part\s+\d+\s*[-–—]\s*)?(.+)/);
    if (partMatch && !line.includes("──────")) {
      if (currentPart && currentPart.ids.length > 0) {
        parts.push(currentPart);
      }
      currentPart = { name: partMatch[1].trim(), color: colors[colorIdx % colors.length], ids: [] };
      colorIdx++;
      continue;
    }
    // Detect chapter id
    const idMatch = line.match(/^\s+- id:\s*(.+)/);
    if (idMatch) {
      const id = idMatch[1].trim().replace(/^["']|["']$/g, "");
      if (currentPart) {
        currentPart.ids.push(id);
      } else {
        currentPart = { name: "章节", color: colors[0], ids: [id] };
      }
    }
  }
  if (currentPart && currentPart.ids.length > 0) {
    parts.push(currentPart);
  }
  return parts;
}
