"use client";

import { useEffect, useRef, useState } from "react";

interface MermaidDiagramProps {
  chart: string;
}

export function MermaidDiagram({ chart }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!containerRef.current || !chart) return;

    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);

        // Clear previous content
        if (containerRef.current) {
          containerRef.current.innerHTML = "";
        }

        const mermaid = (await import("mermaid")).default;

        // 修复 mermaid 初始化配置
        mermaid.initialize({
          startOnLoad: true,
          theme: "default",
          securityLevel: "loose",
          fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace",
          flowchart: {
            useMaxWidth: true,
            htmlLabels: true,
          },
          sequence: {
            useMaxWidth: true,
            noteMargin: 10,
          },
          themeVariables: {
            primaryColor: "#06b6d4",
            primaryTextColor: "#fff",
            primaryBorderColor: "#06b6d4",
            lineColor: "#F8B229",
            secondaryColor: "#006100",
            tertiaryColor: "#fff"
          }
        });

        if (cancelled) return;

        // 尝试渲染图表
        const id = `mermaid-${Math.random().toString(36).slice(2)}`;
        const { svg } = await mermaid.render(id, chart);

        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          console.error("Mermaid rendering error:", e);
          setError(String(e));
          setLoading(false);

          // 显示原始图表代码作为回退
          if (containerRef.current) {
            containerRef.current.innerHTML = `<pre style="color: var(--text-secondary); font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace; padding: 16px; background: var(--bg-card); border-radius: 8px; overflow: auto;">${chart}</pre>`;
          }
        }
      }
    })();

    return () => { cancelled = true; };
  }, [chart]);

  if (error) {
    return (
      <div style={{
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: 16,
        background: "var(--bg-card)"
      }}>
        <div style={{ color: "var(--text-secondary)", fontSize: 12, marginBottom: 8 }}>
          Mermaid 图表渲染失败
        </div>
        <pre style={{
          fontSize: 12,
          color: "var(--text-secondary)",
          whiteSpace: "pre-wrap",
          background: "var(--bg)",
          padding: 12,
          borderRadius: 4,
          margin: 0
        }}>
          {chart}
        </pre>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: 16,
        background: "var(--bg-card)",
        textAlign: "center",
        color: "var(--text-secondary)",
        fontSize: 14
      }}>
        正在渲染图表...
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="mermaid-container"
      style={{
        display: "flex",
        justifyContent: "center",
        overflow: "auto",
        minHeight: "200px"
      }}
    />
  );
}
