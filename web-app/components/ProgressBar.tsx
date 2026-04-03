interface ProgressBarProps {
  analyzed: number;
  total: number;
}

export function ProgressBar({ analyzed, total }: ProgressBarProps) {
  const pct = total > 0 ? Math.round((analyzed / total) * 100) : 0;

  return (
    <div className="card" style={{ padding: "16px 20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 14 }}>
        <span>分析进度</span>
        <span style={{ fontWeight: 600, color: "var(--accent)" }}>{pct}%</span>
      </div>
      <div style={{
        height: 8,
        borderRadius: 4,
        background: "var(--border)",
        overflow: "hidden",
      }}>
        <div style={{
          height: "100%",
          width: `${pct}%`,
          borderRadius: 4,
          background: "linear-gradient(90deg, var(--accent), var(--accent-2))",
          transition: "width 0.5s ease",
        }} />
      </div>
      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
        {analyzed} / {total} 模块已完成分析
      </div>
    </div>
  );
}
