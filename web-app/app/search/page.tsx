import { loadKnowledge } from "@/lib/load-knowledge";
import { buildSearchEntries } from "@/lib/search-index";
import { SearchClient } from "@/components/SearchClient";

export default function SearchPage() {
  const knowledge = loadKnowledge();
  const entries = buildSearchEntries(knowledge.modules, knowledge.chapters);

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 24 }}>搜索</h1>
      <SearchClient entries={entries} />

      {/* 搜索结果展示 */}
      <div style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>搜索索引</h2>
        <div style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: 16
        }}>
          <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 8 }}>
            共 {entries.length} 个可搜索条目
          </p>
          <div style={{ display: "grid", gap: 12 }}>
            {entries.slice(0, 10).map((entry) => (
              <div key={entry.id} style={{
                padding: 12,
                border: "1px solid var(--border)",
                borderRadius: 6,
                background: "var(--bg)"
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{
                    fontSize: 12,
                    padding: "2px 8px",
                    borderRadius: 4,
                    background: getTypeColor(entry.type),
                    color: "white"
                  }}>
                    {getTypeLabel(entry.type)}
                  </span>
                  <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>{entry.title}</h3>
                </div>
                <p style={{
                  fontSize: 14,
                  color: "var(--text-secondary)",
                  margin: 0,
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden"
                }}>
                  {entry.content.slice(0, 100)}...
                </p>
                <a
                  href={entry.href}
                  style={{
                    fontSize: 12,
                    color: "var(--accent)",
                    textDecoration: "none",
                    display: "inline-block",
                    marginTop: 8
                  }}
                >
                  查看详情 →
                </a>
              </div>
            ))}
          </div>
          {entries.length > 10 && (
            <p style={{ color: "var(--text-secondary)", fontSize: 12, marginTop: 12 }}>
              还有 {entries.length - 10} 个条目...
            </p>
          )}
        </div>
      </div>
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
