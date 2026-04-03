"use client";

import { useEffect, useState } from "react";
import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import type { SearchEntry } from "@/lib/search-index";

export function CommandPalette({ entries }: { entries: SearchEntry[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const router = useRouter();

  useEffect(() => {
    // Also support custom event from SearchTrigger
    const handleOpenCmdK = () => setOpen(true);
    document.addEventListener("open-cmdk", handleOpenCmdK);
    
    // Original keyboard listener
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    
    return () => {
      document.removeEventListener("open-cmdk", handleOpenCmdK);
      document.removeEventListener("keydown", down);
    };
  }, []);

  const results = query
    ? entries
        .filter((e) => e.title.toLowerCase().includes(query.toLowerCase()) || e.content.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 20)
    : entries.slice(0, 10);

  return (
    <>
      <div 
        className="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm transition-opacity"
        style={{ display: open ? "block" : "none" }}
        onClick={() => setOpen(false)}
      />
      {open && (
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl z-50 p-4 sm:p-0">
          <Command
            label="Global Command Palette"
            shouldFilter={false}
            className="w-full bg-background border border-border shadow-2xl rounded-xl overflow-hidden flex flex-col"
          >
            <Command.Input 
              value={query} 
              onValueChange={setQuery} 
              autoFocus
              placeholder="搜索章节、内容..." 
              className="w-full px-4 py-4 text-base bg-transparent border-b border-border outline-none text-foreground placeholder:text-muted-foreground"
            />
            <Command.List className="max-h-[300px] overflow-y-auto p-2">
              <Command.Empty className="py-6 text-center text-sm text-muted-foreground">未找到相关结果。</Command.Empty>
              {results.map((entry) => (
                <Command.Item
                  key={entry.id}
                  value={entry.id + " " + entry.title}
                  onSelect={() => {
                    setOpen(false);
                    router.push(entry.href);
                  }}
                  className="flex flex-col gap-1 px-4 py-3 cursor-pointer rounded-lg text-muted-foreground transition-colors data-[selected=true]:bg-muted data-[selected=true]:text-foreground"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-0.5 rounded bg-muted/80 text-foreground font-medium border border-border/50">
                      {entry.type === "chapter" ? "章节" : entry.type === "section" ? "小节" : "模块"}
                    </span>
                    <span className="font-medium text-sm text-foreground">{entry.title}</span>
                  </div>
                  <span className="text-xs text-muted-foreground/70 truncate w-full block">
                    {entry.content.substring(0, 150)}...
                  </span>
                </Command.Item>
              ))}
            </Command.List>
          </Command>
        </div>
      )}
    </>
  );
}
