"use client";

import { useEffect, useState } from "react";

interface CodeBlockProps {
  code: string;
  lang?: string;
}

let highlighterInstance: any = null;
let highlighterPromise: Promise<any> | null = null;

async function getHighlighter() {
  if (highlighterInstance) return highlighterInstance;
  if (highlighterPromise) return highlighterPromise;

  // Shiki v4 API: use bundledJSOnig instead of createHighlighter
  highlighterPromise = import("shiki").then(async (shiki) => {
    const highlighter = await shiki.createHighlighter({
      themes: ["github-dark"],
      langs: ["typescript", "javascript", "python", "json", "yaml", "bash", "tsx", "jsx", "rust", "go", "java", "text"]
    });
    return highlighter;
  }).catch((error) => {
    console.warn("Failed to load Shiki highlighter:", error);
    return null;
  });

  return highlighterPromise;
}

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

    const normalizedLang = lang || "typescript";
    // Check if language is supported, fallback to text
    const supportedLangs = highlighter.getLoadedLanguages();
    const safeLang = supportedLangs.includes(normalizedLang) ? normalizedLang : "text";

    const html = highlighter.codeToHtml(code, {
      lang: safeLang,
      theme: "github-dark",
    });

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
    if (!code || code.trim().length === 0) {
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
          if (result && result.trim().length > 0) {
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

  if (!code) {
    return null;
  }

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
      color: "var(--text-primary)",
      fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace"
    }}>
      <code>
        {code}
      </code>
    </pre>
  );
}