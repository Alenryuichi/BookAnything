"use client";

import { useEffect, useState } from "react";

interface CodeBlockProps {
  code: string;
  lang?: string;
}

async function highlightCode(code: string, lang: string): Promise<string | null> {
  try {
    const { codeToHtml } = await import("shiki");

    // 修复主题和语言配置
    const html = await codeToHtml(code, {
      lang: lang || "typescript",
      theme: "github-dark",
    });
    return html;
  } catch (error) {
    console.warn("Shiki highlighting failed:", error);

    // 回退方案：使用简单的语法高亮
    try {
      const { codeToHtml } = await import("shiki");
      const html = await codeToHtml(code, {
        lang: "text",
        theme: "github-dark",
      });
      return html;
    } catch (fallbackError) {
      console.warn("Shiki fallback also failed:", fallbackError);
      return null;
    }
  }
}

export function CodeBlock({ code, lang = "typescript" }: CodeBlockProps) {
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!code) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        const result = await highlightCode(code, lang);
        if (!cancelled) {
          setHighlighted(result);
        }
      } catch (error) {
        if (!cancelled) {
          setHighlighted(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code, lang]);

  if (!code) return null;

  if (loading) {
    return (
      <pre style={{
        background: "#0d1117",
        borderRadius: 8,
        padding: 16,
        overflow: "auto",
        fontSize: 13,
        lineHeight: 1.6,
        border: "1px solid var(--border)",
        color: "#e6edf3",
        fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace"
      }}>
        <code>{code}</code>
      </pre>
    );
  }

  if (highlighted) {
    return (
      <div
        className="code-block-shiki"
        dangerouslySetInnerHTML={{ __html: highlighted }}
        style={{
          borderRadius: 8,
          overflow: "auto",
          border: "1px solid var(--border)",
        }}
      />
    );
  }

  // Fallback: plain text
  return (
    <pre style={{
      background: "#0d1117",
      borderRadius: 8,
      padding: 16,
      overflow: "auto",
      fontSize: 13,
      lineHeight: 1.6,
      border: "1px solid var(--border)",
    }}>
      <code style={{ color: "#e6edf3", fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace" }}>
        {code}
      </code>
    </pre>
  );
}
