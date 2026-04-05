"use client";

import { useEffect, useRef, useState } from "react";

interface MermaidDiagramProps {
  chart: string;
}

export function MermaidDiagram({ chart }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [jsLoaded, setJsLoaded] = useState(false);

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

        // 动态导入 mermaid 库
        const mermaidModule = await import("mermaid");
        const mermaid = (mermaidModule as any).default || mermaidModule;

        setJsLoaded(true);

        // 初始化 mermaid (只用一次，避免重复初始化)
        if ((mermaid as any)._initialized === undefined) {
          (mermaid as any)._initialized = true;
          mermaid.initialize({
            startOnLoad: false,
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
        }

        if (cancelled) return;

        // 生成唯一 ID 用于渲染
        const uniqueId = `mermaid-${Math.random().toString(36).substring(7)}-${Date.now()}`;

        // 使用 mermaid.render() 直接渲染到容器 (更可靠的 API)
        try {
          const renderId = `mermaid-svg-${uniqueId}`;
          const { svg } = await (mermaid as any).render(renderId, chart);

          if (!cancelled && containerRef.current && svg) {
            containerRef.current.innerHTML = svg;
            setLoading(false);
          }
        } catch (renderError) {
          if (!cancelled) {
            console.error("Mermaid rendering error:", renderError);
            setError("图表渲染失败，请检查语法");
            setLoading(false);

            if (containerRef.current) {
              containerRef.current.innerHTML = `<pre style="color: var(--text-secondary); font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace; padding: 16px; background: var(--bg-card); border-radius: 8px; overflow: auto;">${chart}</pre>`;
            }
          }
        }
      } catch (e) {
        if (!cancelled) {
          console.error("Mermaid rendering error:", e);
          setError(String(e));
          setLoading(false);

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

  return (
    <div style={{ position: "relative" }}>
      <div
        ref={containerRef}
        className="mermaid-container"
        style={{
          display: "flex",
          justifyContent: "center",
          overflow: "auto",
          minHeight: loading ? "60px" : "auto"
        }}
      />
      {loading && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            minHeight: "60px",
            color: "var(--text-secondary)",
            fontSize: 14,
          }}
        >
          {jsLoaded ? "正在渲染图表..." : "加载 Mermaid 库..."}
        </div>
      )}
    </div>
  );
}
