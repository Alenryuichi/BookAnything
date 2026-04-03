import { loadKnowledge } from "@/lib/load-knowledge";
import { DependencyGraph } from "@/components/DependencyGraph";
import Link from "next/link";

export default function GraphPage() {
  const knowledge = loadKnowledge();
  const { relationships, architecture, modules } = knowledge;

  // Build nodes from analyzed modules + architecture layers
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

  // Build edges from dependency data
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

  return (
    <div>
      <Link href="/" style={{ color: "var(--accent)", textDecoration: "none" }}>← 返回首页</Link>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginTop: 16, marginBottom: 24 }}>
        模块依赖关系图
      </h1>

      {nodes.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 48 }}>
          <p style={{ color: "var(--text-secondary)" }}>
            暂无分析数据。运行 Harness 后将自动生成依赖关系图。
          </p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden", height: 600 }}>
          <DependencyGraph nodes={nodes} edges={edges} />
        </div>
      )}

      {/* Legend */}
      <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 16 }}>
        {architecture.layers.map((layer) => (
          <div key={layer.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 12, height: 12, borderRadius: "50%", background: layer.color }} />
            <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{layer.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
