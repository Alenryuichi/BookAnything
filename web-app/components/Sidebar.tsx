"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ChapterContent } from "@/lib/types";

interface PartGroup {
  name: string;
  color: string;
  ids: string[];
}

interface SidebarProps {
  chapters: Record<string, ChapterContent>;
  parts: PartGroup[];
  bookTitle?: string;
}

export function Sidebar({ chapters, parts, bookTitle }: SidebarProps) {
  const pathname = usePathname();
  const writtenCount = Object.keys(chapters).length;
  const totalCount = parts.reduce((sum, p) => sum + p.ids.length, 0);

  // Extract book display name: "深入理解 XXX" → show "XXX" as accent
  const titleMatch = bookTitle?.match(/^(.+?)(\S+)$/);
  const titlePrefix = titleMatch ? titleMatch[1] : "📖 ";
  const titleAccent = titleMatch ? titleMatch[2] : (bookTitle || "Book");

  return (
    <nav className="sidebar">
      <div style={{ padding: "16px 16px 8px" }}>
        <Link href="/" style={{ textDecoration: "none", color: "var(--text-primary)" }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>
            📖 <span style={{ color: "var(--accent)" }}>{bookTitle || "Book"}</span>
          </div>
        </Link>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
          {writtenCount}/{totalCount} 章已完成
        </div>
      </div>

      {/* Quick links */}
      <div style={{ padding: "8px 12px" }}>
        <Link href="/graph" className={`nav-item ${pathname === "/graph" ? "active" : ""}`} style={{ display: "block", textDecoration: "none" }}>
          🔗 架构图
        </Link>
        <Link href="/search" className={`nav-item ${pathname === "/search" ? "active" : ""}`} style={{ display: "block", textDecoration: "none" }}>
          🔍 搜索
        </Link>
      </div>

      <div style={{ height: 1, background: "var(--border)", margin: "8px 12px" }} />

      {/* Chapter navigation */}
      <div style={{ padding: "0 12px 16px" }}>
        {parts.map((part) => {
          const writtenInPart = part.ids.filter((id) => chapters[id]).length;
          return (
            <div key={part.name} style={{ marginBottom: 8 }}>
              <div style={{
                fontSize: 11,
                fontWeight: 700,
                color: part.color,
                textTransform: "uppercase",
                letterSpacing: 1,
                padding: "6px 8px",
              }}>
                {part.name} ({writtenInPart}/{part.ids.length})
              </div>
              {part.ids.map((chId) => {
                const ch = chapters[chId];
                const isActive = pathname === `/chapters/${chId}`;
                const num = chId.match(/ch(\d+)/)?.[1] || "?";
                return (
                  <Link
                    key={chId}
                    href={`/chapters/${chId}`}
                    className={`nav-item ${isActive ? "active" : ""}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      textDecoration: "none",
                      opacity: ch ? 1 : 0.4,
                      fontSize: 13,
                    }}
                  >
                    <span style={{ fontSize: 8, color: ch ? "#10b981" : "var(--text-secondary)" }}>
                      {ch ? "●" : "○"}
                    </span>
                    <span>第{num}章</span>
                  </Link>
                );
              })}
            </div>
          );
        })}
      </div>
    </nav>
  );
}
