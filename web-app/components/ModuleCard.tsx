interface ModuleCardProps {
  id: string;
  name: string;
  overview: string;
  analyzed: boolean;
  patterns: string[];
}

export function ModuleCard({ id, name, overview, analyzed, patterns }: ModuleCardProps) {
  return (
    <div className="card" style={{ opacity: analyzed ? 1 : 0.6, position: "relative" }}>
      {/* Status indicator */}
      <div style={{
        position: "absolute",
        top: 12,
        right: 12,
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: analyzed ? "#10b981" : "var(--border)",
      }} />

      <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4, paddingRight: 20 }}>{name}</h3>
      <code style={{ fontSize: 11, color: "var(--text-secondary)" }}>{id}</code>

      <p style={{
        fontSize: 13,
        color: "var(--text-secondary)",
        marginTop: 8,
        lineHeight: 1.6,
        display: "-webkit-box",
        WebkitLineClamp: 3,
        WebkitBoxOrient: "vertical",
        overflow: "hidden",
      }}>
        {overview}
      </p>

      {patterns.length > 0 && (
        <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 4 }}>
          {patterns.map((p, i) => (
            <span key={i} style={{
              fontSize: 11,
              padding: "2px 8px",
              borderRadius: 10,
              background: "rgba(6,182,212,0.1)",
              color: "var(--accent)",
            }}>
              {p.split(":")[0]}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
