import { NextResponse } from "next/server";
import { loadKnowledge } from "@/lib/load-knowledge";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ bookId: string }> }
) {
  const { bookId } = await params;
  try {
    const knowledge = loadKnowledge(bookId);
    const { relationships, architecture, modules } = knowledge;

    const nodes = Object.entries(modules).map(([id, mod]) => {
      const layer = architecture.layers.find((l) => l.modules.includes(id));
      return {
        id,
        name: mod.module_name,
        layer: layer?.id || "unknown",
        color: layer?.color || "#666",
        size: mod.file_count || 10,
      };
    });

    const edges: { source: string; target: string }[] = [];
    for (const [id, mod] of Object.entries(modules)) {
      for (const dep of mod.dependencies?.depends_on || []) {
        if (modules[dep]) {
          edges.push({ source: id, target: dep });
        }
      }
    }
    
    // Also include relationship data if available
    for (const edge of relationships.edges || []) {
      if (!edges.find((e) => e.source === edge.source && e.target === edge.target)) {
        edges.push({ source: edge.source, target: edge.target });
      }
    }

    return NextResponse.json({ 
      nodes, 
      edges,
      layers: architecture.layers
    });
  } catch (error) {
    return NextResponse.json({ error: "Failed to load graph data" }, { status: 500 });
  }
}
