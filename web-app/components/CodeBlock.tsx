"use client";

import { useEffect, useState } from "react";

interface CodeBlockProps {
  code: string;
  lang?: string;
}

// 预加载 Shiki 以提高性能
let shikiLoaded = false;
let shikiPromise: Promise<any> | null = null;

async function loadShiki() {
  if (shikiLoaded) return;
  if (shikiPromise) return shikiPromise;

  shikiPromise = import("shiki").then((module) => {
    shikiLoaded = true;
    return module;
  });

  return shikiPromise;
}

// 缓存已高亮的代码
const highlightCache = new Map<string, string>();

function getCacheKey(code: string, lang: string): string {
  return `${lang}:${code}`;
}

async function highlightCode(code: string, lang: string): Promise<string | null> {
  const cacheKey = getCacheKey(code, lang);
  if (highlightCache.has(cacheKey)) {
    return highlightCache.get(cacheKey) || null;
  }

  try {
    const shiki = await loadShiki();
    const { codeToHtml } = shiki;

    // 根据当前主题选择高亮主题
    const theme = typeof window !== "undefined" &&
                  document.documentElement.getAttribute("data-theme") === "light"
                  ? "github-light"
                  : "github-dark";

    const html = await codeToHtml(code, {
      lang: lang || "typescript",
      theme,
    });

    highlightCache.set(cacheKey, html);
    return html;
  } catch (error) {
    console.warn("Shiki highlighting failed:", error);

    // 回退方案：使用简单的语法高亮
    try {
      const shiki = await loadShiki();
      const { codeToHtml } = shiki;

      const html = await codeToHtml(code, {
        lang: "text",
        theme: "github-dark",
      });

      highlightCache.set(cacheKey, html);
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
        background: "var(--bg-card)",
        borderRadius: 8,
        padding: 16,
        overflow: "auto",
        fontSize: 13,
        lineHeight: 1.6,
        border: "1px solid var(--border)",
        color: "var(--text-primary)",
        fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace",
        margin: "16px 0"
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
          margin: "16px 0",
          background: "var(--bg-card)",
        }}
      />
    );
  }

  // Fallback: plain text with better styling
  return (
    <pre style={{
      background: "var(--bg-card)",
      borderRadius: 8,
      padding: 16,
      overflow: "auto",
      fontSize: 13,
      lineHeight: 1.6,
      border: "1px solid var(--border)",
      margin: "16px 0",
    }}>
      <code style={{
        color: "var(--text-primary)",
        fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace"
      }}>
        {code}
      </code>
    </pre>
  );
}