import { codeToHtml } from "shiki";

interface CodeBlockProps {
  code: string;
  lang?: string;
}

async function highlightCode(code: string, lang: string): Promise<string | null> {
  try {
    const html = await codeToHtml(code, {
      lang,
      theme: "github-dark-default",
    });
    return html;
  } catch {
    return null;
  }
}

export async function CodeBlock({ code, lang = "typescript" }: CodeBlockProps) {
  if (!code) return null;

  const highlighted = await highlightCode(code, lang);

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
