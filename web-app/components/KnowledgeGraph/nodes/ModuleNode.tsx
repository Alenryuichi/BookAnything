"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

interface ModuleNodeData {
  label: string;
  fileCount: number;
  layer: string;
  isCovered: boolean;
  color: string;
  [key: string]: unknown;
}

function ModuleNodeInner({ data }: NodeProps) {
  const d = data as unknown as ModuleNodeData;
  return (
    <div
      className={`px-4 py-3 rounded-xl border-2 bg-background shadow-sm min-w-[160px] transition-all ${
        d.isCovered === false ? "opacity-50 !border-red-500/80 bg-red-50/50 dark:bg-red-950/20" : ""
      }`}
      style={d.isCovered === false ? {} : { borderColor: d.color + "60", backgroundColor: d.color + "08" }}
    >
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-slate-400" />
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm">📁</span>
        <span className="text-xs font-bold truncate">{d.label}</span>
      </div>
      <div className="text-[10px] text-muted-foreground">
        {d.fileCount} file{d.fileCount !== 1 ? "s" : ""}
      </div>
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-slate-400" />
    </div>
  );
}

export const ModuleNode = memo(ModuleNodeInner);
