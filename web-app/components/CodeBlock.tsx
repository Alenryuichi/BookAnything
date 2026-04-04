"use client";

import { useEffect, useState } from "react";

interface CodeBlockProps {
  code: string;
  lang?: string;
}

// Import Shiki bundler for client-side rendering
let highlighterInstance: any = null;
let highlighterPromise: Promise<any> | null = null;

async function getHighlighter() {
  if (highlighterInstance) return highlighterInstance;
  if (highlighterPromise) return highlighterPromise;

  // Use Shiki v4's new API for client-side rendering
  highlighterPromise = import("shiki").then((shiki) => {
    return shiki.createHighlighter({
      themes: ["github-dark", "github-light"],
      langs: ["typescript", "javascript", "python", "json", "yaml", "bash", "tsx", "jsx", "rust", "go", "java"]
    });
  }).then((highlighter) => {
    highlighterInstance = highlighter;
    return highlighter;
  }).catch((error) => {
    console.warn("Failed to load Shiki highlighter:", error);
    return null;
  });

  return highlighterPromise;
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

  if (!code || code.trim().length === 0) {
    return null;
  }

  try {
    const highlighter = await getHighlighter();
    if (!highlighter) {
      console.warn("Shiki highlighter not available");
      return null;
    }

    // 改进主题检测逻辑
    let theme = "github-dark";
    if (typeof window !== "undefined") {
      const isLight = document.documentElement.getAttribute("data-theme") === "light" ||
                     document.documentElement.classList.contains("light");
      theme = isLight ? "github-light" : "github-dark";
    }

    // Shiki v4 API: codeToHtml 是同步方法
    const html = highlighter.codeToHtml(code, {
      lang: lang || "typescript",
      theme,
    });

    // 检查返回结果是否有效
    if (!html || html.length === 0) {
      console.warn("Shiki codeToHtml returned empty string");
      return null;
    }

    highlightCache.set(cacheKey, html);
    return html;
  } catch (error) {
    console.warn("Shiki highlighting failed:", error);
    return null;
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
          // Only set highlighted if we got actual HTML content
          if (result && result.trim().length > 0 && result.includes("<pre")) {
            setHighlighted(result);
          } else {
            setHighlighted(null);
          }
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Code highlighting error:", error);
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