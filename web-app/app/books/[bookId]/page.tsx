export const dynamic = "force-dynamic";
import { loadKnowledge, loadParts, loadBookTitle, loadBookStats } from "@/lib/load-knowledge";
import Link from "next/link";
import { GraphTriggerButton } from "@/components/GraphTriggerButton";
import { StartGenerationButton } from "@/components/StartGenerationButton";
import { CoverageDashboard } from "@/components/CoverageDashboard";

export default async function BookPage({ params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params;
  const knowledge = loadKnowledge(bookId);
  const chapters = knowledge.chapters;
  const parts = loadParts(bookId);
  const bookTitle = loadBookTitle(bookId);
  const stats = loadBookStats(bookId);
  const writtenCount = Object.keys(chapters).length;
  const totalChapters = parts.reduce((sum, p) => sum + p.ids.length, 0);

  let chapterNum = 0;
  const chapterNumMap: Record<string, number> = {};
  for (const part of parts) {
    for (const id of part.ids) {
      chapterNum++;
      chapterNumMap[id] = chapterNum;
    }
  }

  const progress = totalChapters > 0 ? Math.round((writtenCount / totalChapters) * 100) : 0;

  return (
    <div className="max-w-3xl mx-auto">
      <Link href="/books" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
        ← 返回书架
      </Link>
      
      <div className="text-center mb-16 pt-8">
        <h1 className="text-4xl font-extrabold tracking-tight leading-tight">{bookTitle}</h1>
        <p className="text-lg text-muted-foreground mt-3">
          一本由浅入深的交互式技术书
        </p>
        
        <div className="flex justify-center gap-8 mt-8">
          <div>
            <div className="text-2xl font-bold tracking-tight">{totalChapters}</div>
            <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider mt-1">章节</div>
          </div>
          {stats.files > 0 && (
            <div>
              <div className="text-2xl font-bold tracking-tight">{stats.files.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider mt-1">源文件</div>
            </div>
          )}
          {stats.lines > 0 && (
            <div>
              <div className="text-2xl font-bold tracking-tight">{stats.lines >= 1000 ? `${Math.round(stats.lines / 1000)}K` : stats.lines}</div>
              <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider mt-1">代码行数</div>
            </div>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-12">
        <div className="flex justify-between text-sm text-muted-foreground mb-2 font-medium">
          <span>阅读进度 ({writtenCount}/{totalChapters} 章)</span>
          <span>{progress}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div 
            className="h-full bg-foreground transition-all duration-500 ease-out" 
            style={{ width: `${progress}%` }} 
          />
        </div>
      </div>

      {knowledge.outline && <CoverageDashboard outline={knowledge.outline} />}

      <div className="mt-12 space-y-12">
        {parts.map((part) => (
          <div key={part.name}>
            <h2 className="text-xs font-bold uppercase tracking-wider mb-4 pb-2 border-b border-border/50 text-muted-foreground">
              {part.name}
            </h2>
            <div className="space-y-2">
              {part.ids.map((id) => {
                const ch = chapters[id];
                const isWritten = !!ch;
                const num = chapterNumMap[id] || 0;
                let outlineChapter = null;
                if (knowledge.outline) {
                  for (const p of knowledge.outline.parts) {
                    const c = p.chapters.find(c => c.id === id);
                    if (c) { outlineChapter = c; break; }
                  }
                }
                const coverageCount = outlineChapter?.kg_coverage?.length || 0;
                
                return (
                  <Link 
                    key={id} 
                    href={`/books/${bookId}/chapters/${id}`} 
                    className={`group block p-4 bg-card border rounded-lg transition-all duration-200 ${
                      isWritten 
                        ? "border-border hover:border-foreground" 
                        : "border-border/50 opacity-60 hover:opacity-80"
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                        isWritten ? "bg-foreground text-background" : "bg-muted text-muted-foreground"
                      }`}>
                        {isWritten ? num : "·"}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className={`font-semibold text-base tracking-tight truncate ${isWritten ? "text-foreground" : "text-muted-foreground"}`}>
                          {ch?.title || `第${num}章`}
                        </div>
                        {(ch?.subtitle || !isWritten) && (
                          <div className="text-sm text-muted-foreground mt-1 truncate">
                            {ch?.subtitle || "等待撰写..."}
                          </div>
                        )}
                        {isWritten && ch?.word_count > 0 && (
                          <div className="flex items-center gap-3 text-xs text-muted-foreground font-medium mt-2">
                            <span>{ch.word_count} 字 · {Math.ceil(ch.word_count / 500)} 分钟</span>
                            {coverageCount > 0 && (
                              <span className="px-1.5 py-0.5 rounded-sm bg-muted text-[10px]">
                                {coverageCount} concepts covered
                              </span>
                            )}
                          </div>
                        )}
                        {!isWritten && coverageCount > 0 && (
                          <div className="text-xs text-muted-foreground font-medium mt-2">
                            <span className="px-1.5 py-0.5 rounded-sm bg-muted text-[10px]">
                              Plans to cover {coverageCount} concepts
                            </span>
                          </div>
                        )}
                      </div>
                      
                      {isWritten && (
                        <div className="shrink-0 text-foreground opacity-0 group-hover:opacity-100 transition-opacity flex items-center h-8">
                          <span className="text-xs font-medium">阅读 →</span>
                        </div>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-4 mt-12 justify-center items-center">
        <StartGenerationButton bookId={bookId} className="px-5 py-2.5 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50" />
<GraphTriggerButton className="px-5 py-2.5 rounded-lg border border-border bg-card text-sm font-medium hover:border-foreground transition-colors">
          🔗 架构依赖图
        </GraphTriggerButton>
        <Link
          href={`/books/${bookId}/explore`}
          className="px-5 py-2.5 rounded-lg border border-border bg-card text-sm font-medium hover:border-foreground transition-colors"
        >
          🧠 知识图谱
        </Link>
      </div>
    </div>
  );
}
