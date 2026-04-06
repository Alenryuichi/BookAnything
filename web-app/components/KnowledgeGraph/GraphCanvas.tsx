"use client";

import { useCallback, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  type Node,
  type Edge,
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { FileNode } from "./nodes/FileNode";
import { ModuleNode } from "./nodes/ModuleNode";

const nodeTypes = {
  fileNode: FileNode,
  moduleNode: ModuleNode,
};

interface Props {
  nodes: Node[];
  edges: Edge[];
  onNodeClick: (nodeId: string) => void;
}

export function GraphCanvas({ nodes, edges, onNodeClick }: Props) {
  const handleNodeClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      onNodeClick(node.id);
    },
    [onNodeClick]
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodeClick={handleNodeClick}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      minZoom={0.1}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
      className="bg-background"
    >
      <Background gap={20} size={1} color="var(--border)" />
      <Controls
        showInteractive={false}
        className="!bg-background !border-border !shadow-lg [&>button]:!bg-background [&>button]:!border-border [&>button]:!text-foreground"
      />
      <MiniMap
        nodeColor={(n) => {
          const d = n.data as Record<string, unknown>;
          return (d?.color as string) || "#6b7280";
        }}
        maskColor="rgba(0,0,0,0.5)"
        className="!bg-background !border-border"
        pannable
        zoomable
      />
    </ReactFlow>
  );
}
