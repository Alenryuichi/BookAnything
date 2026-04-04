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

        // 动态导入 mermaid 库 (v11 使用 namespace import)
        const mermaidModule = await import("mermaid");
        const mermaid = mermaidModule.default || mermaidModule;

        setJsLoaded(true);

        // 确保 mermaid 正确初始化
        try {
          // 使用更简单的初始化配置，避免复杂的版本检测
          mermaid.initialize({
            startOnLoad: false, // 手动控制渲染
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
        } catch (initError) {
          console.error("Mermaid initialization failed:", initError);
          if (!cancelled) {
            setError("Mermaid 初始化失败");
            setLoading(false);
          }
          return;
        }

        if (cancelled) return;

        // 创建 mermaid 容器并生成唯一 ID
        const uniqueId = `mermaid-${Math.random().toString(36).substring(7)}`;
        const mermaidContainer = document.createElement('div');
        mermaidContainer.id = uniqueId;
        mermaidContainer.className = 'mermaid';
        mermaidContainer.textContent = chart;

        // 确保容器已清空并添加新的 mermaid 容器
        if (containerRef.current) {
          containerRef.current.innerHTML = '';
          containerRef.current.appendChild(mermaidContainer);
        }

        // 使用 mermaid.run() 渲染 (v11 API)
        try {
          // 确保容器已添加到 DOM 中
          if (containerRef.current && !containerRef.current.contains(mermaidContainer)) {
            containerRef.current.appendChild(mermaidContainer);
          }

          // 使用 mermaid.run() 渲染图表
          if (typeof mermaid.run === 'function') {
            await mermaid.run({
              elements: [mermaidContainer]
            });
          } else {
            // 如果 run 方法不存在，使用 render 方法
            const { svg } = await mermaid.render(uniqueId, chart);
            mermaidContainer.innerHTML = svg;
          }

          if (!cancelled) {
            setLoading(false);
          }
        } catch (renderError) {
          if (!cancelled) {
            console.error("Mermaid rendering error:", renderError);
            setError("图表渲染失败，请检查语法");
            setLoading(false);

            // 显示原始图表代码作为回退
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

  return (
    <div
      ref={containerRef}
      className="mermaid-container"
      style={{
        display: "flex",
        justifyContent: "center",
        overflow: "auto",
        minHeight: loading ? "60px" : "auto"
      }}
    >
      {loading && (
        <div style={{
          color: "var(--text-secondary)",
          fontSize: 14,
          alignSelf: "center"
        }}>
          {jsLoaded ? "正在渲染图表..." : "加载 Mermaid 库..."}
        </div>
      )}
    </div>
  );
}
