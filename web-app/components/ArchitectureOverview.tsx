import type { ArchitectureLayer } from "@/lib/types";

interface ArchitectureOverviewProps {
  layers: ArchitectureLayer[];
}

export function ArchitectureOverview({ layers }: ArchitectureOverviewProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {layers.map((layer, i) => (
        <div
          key={layer.id}
          className="card"
          style={{
            borderLeft: `4px solid ${layer.color}`,
            display: "flex",
            alignItems: "center",
            gap: 16,
            padding: "16px 20px",
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              background: `${layer.color}20`,
              color: layer.color,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              fontSize: 14,
              flexShrink: 0,
            }}
          >
            L{i + 1}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, marginBottom: 2 }}>{layer.name}</div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{layer.description}</div>
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", textAlign: "right", flexShrink: 0 }}>
            {layer.modules.length} 模块
          </div>
        </div>
      ))}

      {/* Flow arrows between layers */}
      <div style={{
        textAlign: "center",
        fontSize: 12,
        color: "var(--text-secondary)",
        marginTop: 8,
        padding: "8px 16px",
        background: "var(--bg-card)",
        borderRadius: 8,
        border: "1px dashed var(--border)",
      }}>
        入口层 → CLI 层 → 逻辑层 → 引擎层 → UI 层 ↔ 基础设施层
      </div>
    </div>
  );
}
