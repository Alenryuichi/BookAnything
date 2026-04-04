import { loadKnowledge, loadChapterIds } from "@/lib/load-knowledge";
import { CodeBlock } from "@/components/CodeBlock";
import { MermaidDiagram } from "@/components/MermaidDiagram";
import { Callout } from "@/components/Callout";
import { DataTable } from "@/components/DataTable";
import { ReadingProgress } from "@/components/ReadingProgress";
import Link from "next/link";

const ALL_CHAPTER_IDS = loadChapterIds();

/** Slugify heading for anchor IDs */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Render content string as paragraphs split by \n\n */
function ContentParagraphs({ content }: { content: string }) {
  if (!content) return null;
  const paragraphs = content.split(/\n\n+/).filter((p) => p.trim());
  if (paragraphs.length <= 1) {
    return (
      <div style={{ fontSize: 16, lineHeight: 2, color: "var(--text-primary)" }}>
        {content}
      </div>
    );
  }
  return (
    <div style={{ fontSize: 16, lineHeight: 2, color: "var(--text-primary)" }}>
      {paragraphs.map((p, i) => (
        <p key={i} style={{ marginBottom: 16 }}>
          {p.trim()}
        </p>
      ))}
    </div>
  );
}

export function generateStaticParams() {
  return ALL_CHAPTER_IDS.map((id) => ({ id }));
}

export default async function ChapterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const knowledge = loadKnowledge();
  const ch = knowledge.chapters[id];

  const currentIndex = ALL_CHAPTER_IDS.indexOf(id);
  const prevId = currentIndex > 0 ? ALL_CHAPTER_IDS[currentIndex - 1] : null;
  const nextId = currentIndex < ALL_CHAPTER_IDS.length - 1 ? ALL_CHAPTER_IDS[currentIndex + 1] : null;

  if (!ch) {
    return (
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <Link href="/" style={{ color: "var(--accent)", textDecoration: "none" }}>← 目录</Link>
        <div className="card" style={{ marginTop: 24, textAlign: "center", padding: 64 }}>
          <h2 style={{ fontSize: 24, marginBottom: 12 }}>第 {Math.max(0, currentIndex) + 1} 章</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: 16, lineHeight: 1.8 }}>
            本章内容正在撰写中...<br />
            Harness 运行后将自动生成。
          </p>
        </div>
      </div>
    );
  }

  const sections = ch.sections ?? [];

  return (
    <article style={{ maxWidth: 800, margin: "0 auto" }}>
      <ReadingProgress />
      <Link href="/" style={{ color: "var(--accent)", textDecoration: "none", fontSize: 14 }}>← 返回目录</Link>

      {/* Chapter Header */}
      <header style={{ marginTop: 24, marginBottom: 32 }}>
        <h1 style={{ fontSize: 32, fontWeight: 800, lineHeight: 1.3 }}>{ch.title}</h1>
        {ch.subtitle && (
          <p style={{ fontSize: 18, color: "var(--accent)", marginTop: 8 }}>{ch.subtitle}</p>
        )}
        {ch.word_count > 0 && (
          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            约 {ch.word_count} 字 · {Math.ceil(ch.word_count / 500)} 分钟阅读
          </span>
        )}
      </header>

      {/* Chapter Summary */}
      {ch.chapter_summary && (
        <blockquote style={{
          borderLeft: "4px solid var(--accent)",
          background: "rgba(6, 182, 212, 0.06)",
          borderRadius: "0 8px 8px 0",
          padding: "16px 20px",
          marginBottom: 24,
          fontSize: 15,
          lineHeight: 1.8,
          color: "var(--text-secondary)",
          fontStyle: "italic",
        }}>
          {ch.chapter_summary}
        </blockquote>
      )}

      {/* In-Chapter TOC */}
      {sections.length > 1 && (
        <nav style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: "16px 20px",
          marginBottom: 32,
          fontSize: 14,
        }}>
          <div style={{ fontWeight: 600, marginBottom: 8, color: "var(--text-secondary)" }}>📑 本章目录</div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {sections.map((section, i) => (
              <li key={i} style={{ marginBottom: 4 }}>
                <a
                  href={`#${slugify(section.heading)}`}
                  style={{
                    color: "var(--accent)",
                    textDecoration: "none",
                    lineHeight: 1.8,
                  }}
                >
                  {section.heading}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {/* Opening Hook */}
      {ch.opening_hook && (
        <div style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderLeft: "4px solid var(--accent)",
          borderRadius: 8,
          padding: "24px 28px",
          marginBottom: 32,
          fontSize: 16,
          lineHeight: 2,
          color: "var(--text-primary)",
        }}>
          <ContentParagraphs content={ch.opening_hook} />
        </div>
      )}

      {/* Sections */}
      {sections.map((section, i) => {
        const anchorId = slugify(section.heading);
        return (
          <section key={i} style={{ marginBottom: 40 }}>
            {/* Heading with anchor */}
            <h2
              id={anchorId}
              style={{
                fontSize: 22,
                fontWeight: 700,
                marginBottom: 16,
                paddingBottom: 8,
                borderBottom: "1px solid var(--border)",
                scrollMarginTop: 60,
              }}
            >
              <a
                href={`#${anchorId}`}
                style={{
                  color: "inherit",
                  textDecoration: "none",
                }}
              >
                {section.heading}
                <span style={{
                  color: "var(--text-secondary)",
                  opacity: 0.3,
                  marginLeft: 8,
                  fontSize: 16,
                  fontWeight: 400,
                }}>
                  #
                </span>
              </a>
            </h2>

            {/* Section narrative content — paragraph rendering */}
            <ContentParagraphs content={section.content} />

            {/* Callout */}
            {section.callout?.text && (
              <Callout callout={section.callout} />
            )}

            {/* Table */}
            {section.table?.headers && section.table.headers.length > 0 && (
              <DataTable table={section.table} />
            )}

            {/* Section diagram */}
            {section.diagram?.chart && (
              <div className="card" style={{ marginTop: 20, marginBottom: 20 }}>
                {section.diagram.title && (
                  <h4 style={{ fontSize: 14, color: "var(--accent)", marginBottom: 8 }}>{section.diagram.title}</h4>
                )}
                <MermaidDiagram chart={section.diagram.chart} />
                {section.diagram.description && (
                  <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 8 }}>{section.diagram.description}</p>
                )}
              </div>
            )}

            {/* Additional diagrams from mermaid_diagrams array */}
            {ch.mermaid_diagrams && ch.mermaid_diagrams.map((diagram, diagramIndex) => (
              <div key={diagramIndex} className="card" style={{ marginTop: 20, marginBottom: 20 }}>
                {diagram.title && (
                  <h4 style={{ fontSize: 14, color: "var(--accent)", marginBottom: 8 }}>{diagram.title}</h4>
                )}
                <MermaidDiagram chart={diagram.chart} />
                {diagram.description && (
                  <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 8 }}>{diagram.description}</p>
                )}
              </div>
            ))}

            {/* Section code — shiki highlighted */}
            {section.code && section.code.code && section.code.code.trim().length > 0 && (
              <div style={{ marginTop: 20, marginBottom: 20 }}>
                {section.code.title && (
                  <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{section.code.title}</h4>
                )}
                {section.code.description && (
                  <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 8 }}>{section.code.description}</p>
                )}
                <CodeBlock code={section.code.code} lang={section.code.language || "typescript"} />
                {section.code.annotation && (
                  <p style={{ fontSize: 14, lineHeight: 1.8, color: "var(--text-secondary)", marginTop: 8 }}>
                    {section.code.annotation}
                  </p>
                )}
              </div>
            )}

            {/* Additional code snippets from code_snippets array */}
            {ch.code_snippets && ch.code_snippets.map((snippet, snippetIndex) => (
              <div key={snippetIndex} style={{ marginTop: 20, marginBottom: 20 }}>
                {snippet.title && (
                  <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{snippet.title}</h4>
                )}
                {snippet.description && (
                  <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 8 }}>{snippet.description}</p>
                )}
                <CodeBlock code={snippet.code} lang={snippet.language || "typescript"} />
                {snippet.annotation && (
                  <p style={{ fontSize: 14, lineHeight: 1.8, color: "var(--text-secondary)", marginTop: 8 }}>
                    {snippet.annotation}
                  </p>
                )}
              </div>
            ))}
          </section>
        );
      })}

      {/* Key Takeaways */}
      {(ch.key_takeaways?.length ?? 0) > 0 && (
        <div style={{
          background: "rgba(6, 182, 212, 0.08)",
          border: "1px solid rgba(6, 182, 212, 0.2)",
          borderRadius: 12,
          padding: "24px 28px",
          marginTop: 40,
          marginBottom: 24,
        }}>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: "var(--accent)", marginBottom: 12 }}>📌 关键要点</h3>
          <ul style={{ paddingLeft: 20, lineHeight: 2, fontSize: 15 }}>
            {(ch.key_takeaways ?? []).map((t, i) => <li key={i}>{t}</li>)}
          </ul>
        </div>
      )}

      {/* Further Thinking */}
      {(ch.further_thinking?.length ?? 0) > 0 && (
        <div style={{
          background: "rgba(245, 158, 11, 0.08)",
          border: "1px solid rgba(245, 158, 11, 0.2)",
          borderRadius: 12,
          padding: "24px 28px",
          marginBottom: 40,
        }}>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: "#f59e0b", marginBottom: 12 }}>💡 延伸思考</h3>
          <ul style={{ paddingLeft: 20, lineHeight: 2, fontSize: 15 }}>
            {(ch.further_thinking ?? []).map((t, i) => <li key={i}>{t}</li>)}
          </ul>
        </div>
      )}

      {/* Prev / Next Navigation */}
      <nav style={{ display: "flex", justifyContent: "space-between", marginTop: 48, paddingTop: 24, borderTop: "1px solid var(--border)" }}>
        {prevId ? (
          <Link href={`/chapters/${prevId}`} style={{ color: "var(--accent)", textDecoration: "none", fontSize: 15 }}>
            ← 上一章
          </Link>
        ) : <span />}
        {nextId ? (
          <Link href={`/chapters/${nextId}`} style={{ color: "var(--accent)", textDecoration: "none", fontSize: 15 }}>
            下一章 →
          </Link>
        ) : <span />}
      </nav>
    </article>
  );
}
