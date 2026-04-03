import { loadKnowledge, loadParts, loadBookTitle, loadBookStats } from "@/lib/load-knowledge";
import { ProgressBar } from "@/components/ProgressBar";
import Link from "next/link";

export default function HomePage() {
  const knowledge = loadKnowledge();
  const chapters = knowledge.chapters;
  const parts = loadParts();
  const bookTitle = loadBookTitle();
  const stats = loadBookStats();
  const writtenCount = Object.keys(chapters).length;
  const totalChapters = parts.reduce((sum, p) => sum + p.ids.length, 0);

  // Build chapter num mapping from parts
  let chapterNum = 0;
  const chapterNumMap: Record<string, number> = {};
  for (const part of parts) {
    for (const id of part.ids) {
      chapterNum++;
      chapterNumMap[id] = chapterNum;
    }
  }

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      {/* Book Header */}
      <div style={{ textAlign: "center", marginBottom: 48, paddingTop: 24 }}>
        <h1 style={{ fontSize: 36, fontWeight: 800, lineHeight: 1.3 }}>
          {bookTitle}
        </h1>
        <p style={{ fontSize: 18, color: "var(--text-secondary)", marginTop: 12, lineHeight: 1.6 }}>
          一本由浅入深的交互式技术书
        </p>
        <div style={{ display: "flex", justifyContent: "center", gap: 32, marginTop: 24 }}>
          <div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "var(--accent)" }}>{totalChapters}</div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>章节</div>
          </div>
          {stats.files > 0 && (
            <div>
              <div style={{ fontSize: 28, fontWeight: 700, color: "#10b981" }}>{stats.files.toLocaleString()}</div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>源文件</div>
            </div>
          )}
          {stats.lines > 0 && (
            <div>
              <div style={{ fontSize: 28, fontWeight: 700, color: "#f59e0b" }}>{stats.lines >= 1000 ? `${Math.round(stats.lines / 1000)}K` : stats.lines}</div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>代码行数</div>
            </div>
          )}
        </div>
      </div>

      {/* Progress */}
      <ProgressBar analyzed={writtenCount} total={totalChapters} />

      {/* Table of Contents */}
      <div style={{ marginTop: 40 }}>
        {parts.map((part) => (
          <div key={part.name} style={{ marginBottom: 32 }}>
            <h2 style={{
              fontSize: 16,
              fontWeight: 700,
              color: part.color,
              textTransform: "uppercase",
              letterSpacing: 1,
              marginBottom: 12,
              paddingBottom: 8,
              borderBottom: `2px solid ${part.color}33`,
            }}>
              {part.name}
            </h2>

            {part.ids.map((id) => {
              const ch = chapters[id];
              const isWritten = !!ch;
              const num = chapterNumMap[id] || 0;

              return (
                <Link
                  key={id}
                  href={`/chapters/${id}`}
                  className="card"
                  style={{
                    display: "block",
                    textDecoration: "none",
                    color: "inherit",
                    marginBottom: 8,
                    padding: "16px 20px",
                    opacity: isWritten ? 1 : 0.5,
                    borderLeft: `3px solid ${isWritten ? part.color : "var(--border)"}`,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
                    <div style={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      background: isWritten ? `${part.color}20` : "var(--border)",
                      color: isWritten ? part.color : "var(--text-secondary)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 700,
                      fontSize: 14,
                      flexShrink: 0,
                    }}>
                      {isWritten ? num : "·"}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 16 }}>
                        {ch?.title || `第${num}章`}
                      </div>
                      {(ch?.subtitle || !isWritten) && (
                        <div style={{ fontSize: 14, color: "var(--text-secondary)", marginTop: 2 }}>
                          {ch?.subtitle || "等待撰写..."}
                        </div>
                      )}
                      {isWritten && ch?.word_count > 0 && (
                        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
                          {ch.word_count} 字 · {Math.ceil(ch.word_count / 500)} 分钟
                        </div>
                      )}
                    </div>
                    {isWritten && (
                      <span style={{ fontSize: 12, color: "#10b981" }}>✓</span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      {/* Links */}
      <div style={{ display: "flex", gap: 16, marginTop: 32, justifyContent: "center" }}>
        <Link href="/graph" className="card" style={{ padding: "12px 24px", textDecoration: "none", color: "var(--accent)", fontSize: 14 }}>
          🔗 架构依赖图
        </Link>
        <Link href="/search" className="card" style={{ padding: "12px 24px", textDecoration: "none", color: "var(--accent)", fontSize: 14 }}>
          🔍 全文搜索
        </Link>
      </div>
    </div>
  );
}
