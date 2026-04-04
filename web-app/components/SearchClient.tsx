"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import type { SearchEntry } from "@/lib/search-index";

// 计算匹配分数
function calculateMatchScore(title: string, content: string, query: string): number {
  const words = query.split(/\s+/).filter(word => word.length > 0);
  let score = 0;

  // 标题完全匹配
  if (title.includes(query)) score += 100;

  // 内容完全匹配
  if (content.includes(query)) score += 50;

  // 单词匹配
  words.forEach(word => {
    if (title.includes(word)) score += 10;
    if (content.includes(word)) score += 5;
  });

  return score;
}

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  chapter: { label: "章节", color: "var(--accent)" },
  section: { label: "小节", color: "#10b981" },
  module: { label: "模块", color: "var(--accent-2)" },
  pattern: { label: "模式", color: "#f59e0b" },
  type: { label: "类型", color: "#8b5cf6" },
};

export function SearchClient({ entries }: { entries: SearchEntry[] }) {
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase().trim();

    // 改进搜索算法，支持更灵活的匹配
    return entries
      .filter((e) => {
        if (!e.title || !e.content) return false;

        const title = e.title.toLowerCase();
        const content = e.content.toLowerCase();

        // 支持单词匹配和部分匹配
        const words = q.split(/\s+/).filter(word => word.length > 0);

        if (words.length === 0) return false;

        // 计算匹配分数：标题匹配权重更高
        let score = 0;

        // 标题完全匹配
        if (title.includes(q)) score += 100;

        // 内容完全匹配
        if (content.includes(q)) score += 50;

        // 单词匹配
        words.forEach(word => {
          if (title.includes(word)) score += 10;
          if (content.includes(word)) score += 5;
        });

        return score > 0;
      })
      .sort((a, b) => {
        // 计算匹配分数进行比较
        const aTitle = a.title.toLowerCase();
        const aContent = a.content.toLowerCase();
        const bTitle = b.title.toLowerCase();
        const bContent = b.content.toLowerCase();

        const aScore = calculateMatchScore(aTitle, aContent, q);
        const bScore = calculateMatchScore(bTitle, bContent, q);

        return bScore - aScore; // 分数高的在前
      })
      .slice(0, 30);
  }, [query, entries]);

  return (
    <div>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="搜索章节、概念、设计模式..."
        style={{
          width: "100%",
          padding: "14px 18px",
          fontSize: 16,
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          color: "var(--text-primary)",
          outline: "none",
        }}
        autoFocus
      />

      {query && (
        <div style={{ marginTop: 8, fontSize: 13, color: "var(--text-secondary)" }}>
          {results.length} 个结果
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        {results.length > 0 ? (
          results.map((r) => {
            const typeInfo = TYPE_LABELS[r.type] || TYPE_LABELS.chapter;
            return (
              <Link
                key={r.id}
                href={r.href}
                className="card"
                style={{
                  display: "block",
                  marginBottom: 12,
                  textDecoration: "none",
                  color: "inherit",
                  padding: "16px 20px",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  transition: "all 0.2s ease-in-out",
                  background: "var(--bg-card)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-2px)";
                  e.currentTarget.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.1)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{
                    fontSize: 11,
                    padding: "4px 12px",
                    borderRadius: 12,
                    background: `${typeInfo.color}15`,
                    color: typeInfo.color,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px"
                  }}>
                    {typeInfo.label}
                  </span>
                  <span style={{
                    fontWeight: 600,
                    fontSize: 16,
                    color: "var(--text-primary)"
                  }}>
                    {r.title}
                  </span>
                </div>
                <p style={{
                  fontSize: 14,
                  color: "var(--text-secondary)",
                  marginTop: 8,
                  lineHeight: 1.6,
                  display: "-webkit-box",
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}>
                  {r.content ? r.content.slice(0, 250) + "..." : "暂无内容描述"}
                </p>
              </Link>
            );
          })
        ) : query ? (
          <div style={{
            textAlign: "center",
            padding: "60px 20px",
            color: "var(--text-secondary)",
            fontSize: 16,
            background: "var(--bg-card)",
            borderRadius: 12,
            border: "1px solid var(--border)"
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
            <div style={{ marginBottom: 8 }}>未找到相关结果</div>
            <div style={{ fontSize: 14, opacity: 0.7 }}>
              尝试使用不同的关键词或检查拼写
            </div>
          </div>
        ) : (
          <div style={{
            textAlign: "center",
            padding: "60px 20px",
            color: "var(--text-secondary)",
            fontSize: 16,
            background: "var(--bg-card)",
            borderRadius: 12,
            border: "1px solid var(--border)"
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>💡</div>
            <div style={{ marginBottom: 8 }}>输入关键词开始搜索</div>
            <div style={{ fontSize: 14, opacity: 0.7 }}>
              支持搜索章节标题、内容、模块名称等
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
