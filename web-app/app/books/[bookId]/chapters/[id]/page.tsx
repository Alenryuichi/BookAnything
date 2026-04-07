export const dynamic = "force-dynamic";
import { loadKnowledge, loadChapterIds } from "@/lib/load-knowledge";
import { CodeBlock } from "@/components/CodeBlock";
import { MermaidDiagram } from "@/components/MermaidDiagram";
import { Callout } from "@/components/Callout";
import { DataTable } from "@/components/DataTable";
import { ReadingProgress } from "@/components/ReadingProgress";
import { TableOfContents } from "@/components/TableOfContents";
import Link from "next/link";
import { ChapterActions } from "@/components/ChapterActions";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function ContentParagraphs({ content }: { content: string }) {
  if (!content) return null;
  const paragraphs = content.split(/\n\n+/).filter((p) => p.trim());
  if (paragraphs.length <= 1) {
    return (
      <div className="prose prose-neutral dark:prose-invert max-w-none text-base leading-relaxed">
        {content}
      </div>
    );
  }
  return (
    <div className="prose prose-neutral dark:prose-invert max-w-none text-base leading-relaxed">
      {paragraphs.map((p, i) => (
        <p key={i} className="mb-4 last:mb-0">
          {p.trim()}
        </p>
      ))}
    </div>
  );
}

export default async function ChapterPage({ params }: { params: Promise<{ bookId: string; id: string }> }) {
  const { bookId, id } = await params;
  const knowledge = loadKnowledge(bookId);
  const ch = knowledge.chapters[id];
  const allChapterIds = loadChapterIds(bookId);

  const currentIndex = allChapterIds.indexOf(id);
  const prevId = currentIndex > 0 ? allChapterIds[currentIndex - 1] : null;
  const nextId = currentIndex < allChapterIds.length - 1 ? allChapterIds[currentIndex + 1] : null;

  if (!ch) {
    return (
      <div className="max-w-3xl mx-auto">
        <Link href={`/books/${bookId}`} className="text-sm text-muted-foreground hover:text-foreground transition-colors">← 返回目录</Link>
        <div className="mt-8 mb-4">
          <ChapterActions bookId={bookId} chapterId={id} />
        </div>
        <div className="p-16 text-center border border-border rounded-xl bg-card">
          <h2 className="text-2xl font-bold mb-4 tracking-tight">第 {currentIndex + 1} 章</h2>
          <p className="text-muted-foreground leading-relaxed">
            本章内容正在撰写中...<br />
            点击上方 Rewrite 按钮可单独生成本章，或等待 Harness 自动运行。
          </p>
        </div>
      </div>
    );
  }

  const sections = ch.sections ?? [];
  const tocItems = sections.map(s => ({ id: slugify(s.heading), title: s.heading }));

  return (
    <div className="flex xl:gap-12 max-w-6xl mx-auto pb-12 px-4">
    <article className="flex-1 min-w-0 max-w-3xl mx-auto w-full">
      <ReadingProgress />
      <Link href={`/books/${bookId}`} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
        ← 返回目录
      </Link>

      <header className="mt-8 mb-10">
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-3 leading-tight">{ch.title}</h1>
        {ch.subtitle && (
          <p className="text-lg text-muted-foreground font-medium mb-4">{ch.subtitle}</p>
        )}
        {ch.word_count > 0 && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground font-medium">
            <span>约 {ch.word_count} 字</span>
            <span className="w-1 h-1 rounded-full bg-border"></span>
            <span>{Math.ceil(ch.word_count / 500)} 分钟阅读</span>
          </div>
        )}
      </header>

      <ChapterActions bookId={bookId} chapterId={id} />

      {ch.chapter_summary && (
        <blockquote className="my-8 pl-5 py-2 border-l-4 border-foreground text-muted-foreground text-lg italic tracking-tight">
          {ch.chapter_summary}
        </blockquote>
      )}

      {sections.length > 1 && (
        <nav className="mb-10 p-5 bg-muted/30 border border-border/50 rounded-xl">
          <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
            📑 本章目录
          </div>
          <ul className="space-y-2 text-sm">
            {sections.map((section, i) => (
              <li key={i}>
                <a
                  href={`#${slugify(section.heading)}`}
                  className="text-foreground/80 hover:text-foreground transition-colors"
                >
                  {section.heading}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {ch.opening_hook && (
        <div className="mb-12 text-lg leading-relaxed text-foreground font-medium">
          <ContentParagraphs content={ch.opening_hook} />
        </div>
      )}

      {sections.map((section, i) => {
        const anchorId = slugify(section.heading);
        return (
          <section key={i} className="mb-14">
            <h2
              id={anchorId}
              className="text-2xl font-bold tracking-tight mb-6 pb-2 border-b border-border/50 scroll-mt-24 group flex items-center"
            >
              <a href={`#${anchorId}`} className="text-foreground no-underline">
                {section.heading}
                <span className="opacity-0 group-hover:opacity-100 text-muted-foreground ml-2 transition-opacity font-normal">#</span>
              </a>
            </h2>

            <ContentParagraphs content={section.content} />

            {section.callout?.text && (
              <div className="my-6">
                <Callout callout={section.callout} />
              </div>
            )}

            {section.table?.headers && section.table.headers.length > 0 && (
              <div className="my-8">
                <DataTable table={section.table} />
              </div>
            )}

            {section.diagram?.chart && (
              <div className="my-8 p-6 bg-card border border-border rounded-xl">
                {section.diagram.title && (
                  <h4 className="text-sm font-bold tracking-tight mb-4">{section.diagram.title}</h4>
                )}
                <MermaidDiagram chart={section.diagram.chart} />
                {section.diagram.description && (
                  <p className="text-sm text-muted-foreground mt-4 text-center">{section.diagram.description}</p>
                )}
              </div>
            )}

            {section.code?.code && (
              <div className="my-8">
                {section.code.title && (
                  <h4 className="text-sm font-bold tracking-tight mb-1">{section.code.title}</h4>
                )}
                {section.code.description && (
                  <p className="text-sm text-muted-foreground mb-3">{section.code.description}</p>
                )}
                <CodeBlock code={section.code.code} lang={section.code.language} />
                {section.code.annotation && (
                  <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
                    {section.code.annotation}
                  </p>
                )}
              </div>
            )}
          </section>
        );
      })}

      {(ch.key_takeaways?.length ?? 0) > 0 && (
        <div className="mt-16 mb-8 p-6 sm:p-8 bg-muted/20 border border-border rounded-xl">
          <h3 className="text-base font-bold tracking-tight mb-4 flex items-center gap-2">
            <span>📌</span> 关键要点
          </h3>
          <ul className="space-y-3">
            {(ch.key_takeaways ?? []).map((t, i) => (
              <li key={i} className="text-sm sm:text-base text-foreground/90 leading-relaxed flex items-start">
                <span className="mr-3 text-muted-foreground mt-1">•</span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(ch.further_thinking?.length ?? 0) > 0 && (
        <div className="mb-12 p-6 sm:p-8 bg-muted/20 border border-border rounded-xl">
          <h3 className="text-base font-bold tracking-tight mb-4 flex items-center gap-2">
            <span>💡</span> 延伸思考
          </h3>
          <ul className="space-y-3">
            {(ch.further_thinking ?? []).map((t, i) => (
              <li key={i} className="text-sm sm:text-base text-foreground/90 leading-relaxed flex items-start">
                <span className="mr-3 text-muted-foreground mt-1">•</span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <nav className="flex justify-between items-center mt-16 pt-8 border-t border-border">
        {prevId ? (
          <Link href={`/books/${bookId}/chapters/${prevId}`} className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center gap-2">
            <span>←</span> 上一章
          </Link>
        ) : <div />}
        {nextId ? (
          <Link href={`/books/${bookId}/chapters/${nextId}`} className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center gap-2">
            下一章 <span>→</span>
          </Link>
        ) : <div />}
      </nav>
    </article>
    {tocItems.length > 0 && <TableOfContents items={tocItems} />}
    </div>
  );
}
