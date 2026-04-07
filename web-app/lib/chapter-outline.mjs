import fs from "fs";
import path from "path";

function toStringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}

function normalizeChapter(chapter) {
  if (!chapter || typeof chapter !== "object") return null;
  return {
    id: typeof chapter.id === "string" ? chapter.id : "",
    title: typeof chapter.title === "string" ? chapter.title : "",
    subtitle: typeof chapter.subtitle === "string" ? chapter.subtitle : "",
    kg_coverage: toStringArray(chapter.kg_coverage),
    prerequisites: toStringArray(chapter.prerequisites),
    topo_rank: typeof chapter.topo_rank === "number" ? chapter.topo_rank : 0,
  };
}

function normalizePart(part) {
  if (!part || typeof part !== "object") return null;
  const chapters = Array.isArray(part.chapters)
    ? part.chapters.map(normalizeChapter).filter(Boolean)
    : [];
  return {
    part_num: typeof part.part_num === "number" ? part.part_num : 0,
    part_title: typeof part.part_title === "string" ? part.part_title : "",
    community_id: typeof part.community_id === "string" ? part.community_id : "",
    kg_node_ids: toStringArray(part.kg_node_ids),
    chapters,
  };
}

export function parseChapterOutline(raw) {
  try {
    const data = JSON.parse(raw);
    return {
      version: typeof data.version === "string" ? data.version : "1.0",
      generated_at: typeof data.generated_at === "string" ? data.generated_at : "",
      algorithm:
        data.algorithm && typeof data.algorithm === "object" ? data.algorithm : {},
      parts: Array.isArray(data.parts)
        ? data.parts.map(normalizePart).filter(Boolean)
        : [],
      uncovered_nodes: toStringArray(data.uncovered_nodes),
    };
  } catch {
    return null;
  }
}

export function loadChapterOutline(bookDir) {
  if (!bookDir) return null;
  const filePath = path.join(bookDir, "chapter-outline.json");
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return parseChapterOutline(raw);
  } catch {
    return null;
  }
}
