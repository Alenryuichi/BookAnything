import { loadKnowledge } from "@/lib/load-knowledge";
import { buildSearchEntries } from "@/lib/search-index";
import { SearchClient } from "@/components/SearchClient";

export default function SearchPage() {
  const knowledge = loadKnowledge();
  const entries = buildSearchEntries(knowledge.modules, knowledge.chapters);

  console.log("Search entries loaded:", entries.length);

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "20px 16px" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 24 }}>搜索</h1>
      <p style={{
        fontSize: 14,
        color: "var(--text-secondary)",
        marginBottom: 32,
        lineHeight: 1.6
      }}>
        搜索章节标题、内容、模块名称等。当前索引了 {entries.length} 个条目。
      </p>
      <SearchClient entries={entries} />
    </div>
  );
}

function getTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    chapter: "章节",
    section: "小节",
    module: "模块",
    pattern: "模式",
    type: "类型"
  };
  return labels[type] || "未知";
}

function getTypeColor(type: string): string {
  const colors: Record<string, string> = {
    chapter: "var(--accent)",
    section: "#10b981",
    module: "var(--accent-2)",
    pattern: "#f59e0b",
    type: "#8b5cf6"
  };
  return colors[type] || "var(--text-secondary)";
}
