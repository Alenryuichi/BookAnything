import { loadKnowledge } from "@/lib/load-knowledge";
import { CodeBlock } from "@/components/CodeBlock";
import { MermaidDiagram } from "@/components/MermaidDiagram";
import Link from "next/link";

// Generate static params for all possible module IDs
export function generateStaticParams() {
  const knowledge = loadKnowledge();
  // Include both analyzed and all known IDs
  const allIds = new Set([
    ...Object.keys(knowledge.modules),
    "core-entry","entrypoints","bootstrap","cli","commands",
    "tools-core","tools-file","tools-exec","tools-agent","tools-task",
    "tools-plan","tools-web","tools-mcp","tools-misc","tasks",
    "query-engine","components","ink-framework","screens","hooks",
    "state","context-providers","services","bridge","server",
    "remote","coordinator","utils","types","constants",
    "keybindings","vim","skills","plugins","migrations",
    "memdir","buddy","voice","root-files",
  ]);
  return Array.from(allIds).map((id) => ({ id }));
}

export default async function ModulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const knowledge = loadKnowledge();
  const mod = knowledge.modules[id];

  if (!mod) {
    return (
      <div>
        <Link href="/" style={{ color: "var(--accent)", textDecoration: "none" }}>← 返回首页</Link>
        <div className="card" style={{ marginTop: 24, textAlign: "center", padding: 48 }}>
          <h2 style={{ fontSize: 24, marginBottom: 8 }}>{id}</h2>
          <p style={{ color: "var(--text-secondary)" }}>此模块尚未分析。Harness 运行后将自动填充数据。</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Link href="/" style={{ color: "var(--accent)", textDecoration: "none" }}>← 返回首页</Link>

      {/* Header */}
      <div className="card" style={{ marginTop: 16 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700 }}>{mod.module_name}</h1>
        <p style={{ color: "var(--text-secondary)", marginTop: 8, lineHeight: 1.7 }}>{mod.overview}</p>
      </div>

      {/* Design Philosophy */}
      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12 }}>设计理念</h2>
        <div className="card">
          <p style={{ lineHeight: 1.8 }}>{mod.design_philosophy}</p>
        </div>
      </section>

      {/* Design Patterns */}
      {(mod.design_patterns?.length ?? 0) > 0 && (
        <section style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12 }}>设计模式</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {(mod.design_patterns ?? []).map((p, i) => (
              <span key={i} style={{
                background: "rgba(6,182,212,0.15)",
                color: "var(--accent)",
                padding: "4px 12px",
                borderRadius: 20,
                fontSize: 13,
              }}>{p}</span>
            ))}
          </div>
        </section>
      )}

      {/* Core Types */}
      {(mod.core_types?.length ?? 0) > 0 && (
        <section style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12 }}>核心类型</h2>
          {(mod.core_types ?? []).map((t, i) => (
            <div key={i} className="card" style={{ marginBottom: 12 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--accent)" }}>{t.name}</h3>
              <p style={{ color: "var(--text-secondary)", margin: "4px 0 12px", fontSize: 14 }}>{t.purpose}</p>
              <CodeBlock code={t.code} lang="typescript" />
            </div>
          ))}
        </section>
      )}

      {/* Key Implementations */}
      {(mod.key_implementations?.length ?? 0) > 0 && (
        <section style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12 }}>关键实现</h2>
          {(mod.key_implementations ?? []).map((impl, i) => (
            <div key={i} className="card" style={{ marginBottom: 12 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600 }}>{impl.name}</h3>
              <p style={{ color: "var(--text-secondary)", margin: "4px 0 8px", fontSize: 14 }}>{impl.description}</p>
              <CodeBlock code={impl.code_snippet} lang="typescript" />
              <p style={{ marginTop: 8, fontSize: 14, lineHeight: 1.7, color: "var(--text-secondary)" }}>{impl.explanation}</p>
            </div>
          ))}
        </section>
      )}

      {/* Dependencies */}
      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12 }}>依赖关系</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div className="card">
            <h3 style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 8 }}>依赖</h3>
            {(mod.dependencies?.depends_on || []).map((dep) => (
              <Link key={dep} href={`/modules/${dep}`} style={{ display: "block", color: "var(--accent)", fontSize: 14, marginBottom: 4, textDecoration: "none" }}>
                {dep}
              </Link>
            ))}
            {(!mod.dependencies?.depends_on?.length) && <span style={{ color: "var(--text-secondary)", fontSize: 14 }}>无</span>}
          </div>
          <div className="card">
            <h3 style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 8 }}>被依赖</h3>
            {(mod.dependencies?.depended_by || []).map((dep) => (
              <Link key={dep} href={`/modules/${dep}`} style={{ display: "block", color: "var(--accent-2)", fontSize: 14, marginBottom: 4, textDecoration: "none" }}>
                {dep}
              </Link>
            ))}
            {(!mod.dependencies?.depended_by?.length) && <span style={{ color: "var(--text-secondary)", fontSize: 14 }}>无</span>}
          </div>
        </div>
      </section>

      {/* Mermaid Diagram */}
      {mod.mermaid_diagram && (
        <section style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12 }}>架构图</h2>
          <div className="card">
            <MermaidDiagram chart={mod.mermaid_diagram} />
          </div>
        </section>
      )}

      {/* Extension Points */}
      {(mod.extension_points?.length ?? 0) > 0 && (
        <section style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12 }}>扩展点</h2>
          <div className="card">
            <ul style={{ paddingLeft: 20 }}>
              {(mod.extension_points ?? []).map((ep, i) => (
                <li key={i} style={{ marginBottom: 6, lineHeight: 1.6 }}>{ep}</li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}
