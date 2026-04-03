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
  bookId?: string;
}

export function Sidebar({ chapters, parts, bookTitle, bookId }: SidebarProps) {
  const pathname = usePathname();
  const writtenCount = Object.keys(chapters).length;
  const totalCount = parts.reduce((sum, p) => sum + p.ids.length, 0);

  const basePath = bookId ? `/books/${bookId}` : "";

  return (
    <nav className="sidebar">
      <div className="px-5 pt-5 pb-3">
        <Link href={basePath || "/"} className="text-foreground no-underline">
          <div className="font-semibold text-sm tracking-tight flex items-center gap-2">
            <span className="opacity-80">📖</span> 
            <span className="truncate">{bookTitle || "BookAnything"}</span>
          </div>
        </Link>
        <div className="text-xs text-muted-foreground mt-1.5 font-medium">
          {writtenCount}/{totalCount} 章已完成
        </div>
      </div>

      <div className="px-3 py-2 space-y-0.5">
        <button 
          onClick={() => document.dispatchEvent(new Event("open-graph-modal"))}
          className="flex w-full items-center gap-2 px-2.5 py-1.5 rounded-md text-sm transition-colors text-muted-foreground hover:text-foreground hover:bg-muted/50"
        >
          <span className="opacity-70 text-xs">🔗</span> 架构图
        </button>
      </div>

      <div className="h-px bg-border mx-4 my-2" />

      <div className="px-3 pb-8">
        {parts.map((part) => {
          const writtenInPart = part.ids.filter((id) => chapters[id]).length;
          return (
            <div key={part.name} className="mb-5 mt-2">
              <div className="text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 text-muted-foreground/80">
                {part.name} ({writtenInPart}/{part.ids.length})
              </div>
              <div className="space-y-0.5 mt-0.5">
                {part.ids.map((chId) => {
                  const ch = chapters[chId];
                  const chapterPath = `${basePath}/chapters/${chId}`;
                  const isActive = pathname === chapterPath;
                  const num = chId.match(/ch(\d+)/)?.[1] || "?";
                  
                  return (
                    <Link
                      key={chId}
                      href={chapterPath}
                      className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm transition-all group ${
                        isActive 
                          ? "font-medium text-foreground relative" 
                          : "text-muted-foreground hover:text-foreground"
                      } ${!ch ? "opacity-50" : ""}`}
                    >
                      {isActive && (
                        <div className="absolute left-0 top-1.5 bottom-1.5 w-0.5 bg-foreground rounded-r-full" />
                      )}
                      <span className={`text-[8px] flex-shrink-0 ${ch ? (isActive ? "text-foreground" : "text-muted-foreground group-hover:text-foreground") : "text-muted-foreground/50"}`}>
                        {ch ? "●" : "○"}
                      </span>
                      <span className="truncate">第{num}章</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </nav>
  );
}
