"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import type { SearchEntry } from "@/lib/search-index";

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
    const q = query.toLowerCase();
    return entries
      .filter((e) => e.title.toLowerCase().includes(q) || e.content.toLowerCase().includes(q))
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
        {results.map((r) => {
          const typeInfo = TYPE_LABELS[r.type] || TYPE_LABELS.chapter;
          return (
            <Link
              key={r.id}
              href={r.href}
              className="card"
              style={{
                display: "block",
                marginBottom: 8,
                textDecoration: "none",
                color: "inherit",
                padding: "14px 18px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{
                  fontSize: 11,
                  padding: "2px 10px",
                  borderRadius: 10,
                  background: `${typeInfo.color}15`,
                  color: typeInfo.color,
                }}>
                  {typeInfo.label}
                </span>
                <span style={{ fontWeight: 600, fontSize: 15 }}>{r.title}</span>
              </div>
              <p style={{
                fontSize: 13,
                color: "var(--text-secondary)",
                marginTop: 6,
                lineHeight: 1.6,
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}>
                {r.content.slice(0, 200)}
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
