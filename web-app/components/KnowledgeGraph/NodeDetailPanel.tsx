"use client";

import { X, FileCode, ArrowRight, ArrowLeft, BookOpen } from "lucide-react";
import type { GraphNode, KnowledgeGraphData } from "./types";
import { LAYER_COLORS, LANG_ICONS } from "./types";

interface Props {
  node: GraphNode;
  data: KnowledgeGraphData;
  bookId: string;
  onClose: () => void;
  onNavigate: (nodeId: string) => void;
}

export function NodeDetailPanel({ node, data, bookId, onClose, onNavigate }: Props) {
  const color = LAYER_COLORS[node.layer] || "#6b7280";
  const langIcon = LANG_ICONS[node.language] || "📄";
  const layerObj = data.layers.find((l) => l.id === node.layer);

  const imports = data.edges.filter((e) => e.source === node.id);
  const importedBy = data.edges.filter((e) => e.target === node.id);
  const chapters = data.chapter_links[node.id] ?? [];

  return (
    <div className="w-80 border-l border-border bg-background/95 backdrop-blur-sm flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Details</span>
        <button onClick={onClose} className="p-1 rounded hover:bg-muted transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
            <h3 className="text-sm font-bold truncate">{node.name}</h3>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            {layerObj && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ backgroundColor: color + "20", color }}>
                {layerObj.name}
              </span>
            )}
            <span>{langIcon} {node.language}</span>
            <span>· {node.line_count} lines</span>
          </div>
          <p className="text-xs text-muted-foreground/80 font-mono mt-1">{node.id}</p>
        </div>

        {/* Summary */}
        {node.summary && (
          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Summary</h4>
            <p className="text-xs leading-relaxed">{node.summary}</p>
          </div>
        )}

        {/* Children (classes/functions) */}
        {node.children.length > 0 && (
          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Contains</h4>
            <div className="space-y-1.5">
              {node.children.map((c) => (
                <div key={c.id} className="text-xs px-2 py-1.5 rounded bg-muted/50">
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground">{c.type === "class" ? "⬡" : "ƒ"}</span>
                    <span className="font-medium">{c.name}</span>
                    {c.type === "class" && c.children.length > 0 && (
                      <span className="text-[10px] text-muted-foreground">({c.children.length} methods)</span>
                    )}
                  </div>
                  {c.summary && <p className="text-[10px] text-muted-foreground mt-0.5">{c.summary}</p>}
                  {c.signature && <code className="text-[10px] text-muted-foreground/70 block mt-0.5 truncate">{c.signature}</code>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Imports */}
        {imports.length > 0 && (
          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
              <ArrowRight className="w-3 h-3 inline mr-1" />Imports ({imports.length})
            </h4>
            <div className="space-y-1">
              {imports.map((e) => (
                <button
                  key={e.target}
                  onClick={() => onNavigate(e.target)}
                  className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors w-full text-left"
                >
                  <span>→</span>
                  <span className="truncate">{e.target}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Imported By */}
        {importedBy.length > 0 && (
          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
              <ArrowLeft className="w-3 h-3 inline mr-1" />Imported By ({importedBy.length})
            </h4>
            <div className="space-y-1">
              {importedBy.map((e) => (
                <button
                  key={e.source}
                  onClick={() => onNavigate(e.source)}
                  className="flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 transition-colors w-full text-left"
                >
                  <span>←</span>
                  <span className="truncate">{e.source}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Chapter Links */}
        {chapters.length > 0 && (
          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
              <BookOpen className="w-3 h-3 inline mr-1" />Referenced In
            </h4>
            <div className="space-y-1">
              {chapters.map((chId) => (
                <a
                  key={chId}
                  href={`/books/${bookId}/chapters/${chId}`}
                  className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 transition-colors"
                >
                  <span>📖</span>
                  <span>{chId}</span>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
