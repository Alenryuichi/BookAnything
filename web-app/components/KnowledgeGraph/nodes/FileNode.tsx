"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { LANG_ICONS } from "../types";

interface FileNodeData {
  label: string;
  type: string;
  layer: string;
  language: string;
  lineCount: number;
  summary: string;
  color: string;
  childCount: number;
  selected: boolean;
  isCovered: boolean;
  [key: string]: unknown;
}

function FileNodeInner({ data }: NodeProps) {
  const d = data as unknown as FileNodeData;
  const langIcon = LANG_ICONS[d.language] || "📄";

  const isCode = d.type === "file" || d.type === "CodeEntity";
  
  return (
    <div
      className={`px-3 py-2 rounded-lg border-2 bg-background shadow-sm min-w-[180px] max-w-[240px] transition-all ${
        d.selected ? "ring-2 ring-blue-400 shadow-lg" : "hover:shadow-md"
      } ${d.isCovered === false ? "opacity-50 !border-red-500/80 bg-red-50/50 dark:bg-red-950/20" : ""}`}
      style={{ borderColor: d.isCovered === false ? undefined : d.color + "80" }}
    >
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-slate-400" />
      
      {!isCode && (
        <div className="mb-1">
          <span 
            className="text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded-sm"
            style={{ backgroundColor: d.color + "20", color: d.color }}
          >
            {d.type}
          </span>
        </div>
      )}
      
      <div className="flex items-center gap-1.5 mb-1">
        <span
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ backgroundColor: d.color }}
        />
        <span className="text-xs font-semibold truncate">{d.label}</span>
      </div>
      
      {isCode && (
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span>{langIcon}</span>
          <span>{d.lineCount} lines</span>
          {d.childCount > 0 && <span>· {d.childCount} symbols</span>}
        </div>
      )}
      
      {d.summary && (
        <div className="mt-1 text-[10px] text-muted-foreground/70 line-clamp-2">
          {d.summary}
        </div>
      )}
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-slate-400" />
    </div>
  );
}

export const FileNode = memo(FileNodeInner);
