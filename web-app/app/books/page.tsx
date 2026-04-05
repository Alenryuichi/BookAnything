export const dynamic = "force-dynamic";
import { loadBookIndex } from "@/lib/load-knowledge";
import Link from "next/link";

export default function BooksPage() {
  const index = loadBookIndex();
  const books = index.books;

  if (books.length === 0) {
    return (
      <div className="max-w-3xl mx-auto text-center pt-20">
        <h1 className="text-3xl font-extrabold tracking-tight mb-4">BookAnything</h1>
        <p className="text-muted-foreground text-lg leading-relaxed">
          还没有书籍。运行 <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-sm">bash new-project.sh /path/to/repo</code> 创建第一本。
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-6">
      <div className="text-center mb-16 pt-10">
        <h1 className="text-4xl font-extrabold tracking-tight">BookAnything</h1>
        <p className="text-muted-foreground text-base mt-3">
          把任何仓库变成一本交互式技术书
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {books.map((book) => {
          const progress = book.chapterCount > 0 ? Math.round((book.writtenCount / book.chapterCount) * 100) : 0;
          return (
            <Link
              key={book.id}
              href={`/books/${book.id}`}
              className="group block p-6 bg-card border border-border rounded-xl transition-all duration-200 hover:border-foreground"
            >
              <div className="flex justify-between items-start mb-3">
                <h2 className="text-lg font-bold tracking-tight line-clamp-1 flex-1">{book.name}</h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-foreground text-background font-medium flex-shrink-0 ml-2">
                  {book.language || "Unknown"}
                </span>
              </div>
              
              {book.description && (
                <p className="text-sm text-muted-foreground mb-6 line-clamp-2 leading-relaxed h-10">
                  {book.description}
                </p>
              )}
              
              {/* Progress bar */}
              <div className="mb-4">
                <div className="flex justify-between text-[11px] text-muted-foreground mb-1.5 font-medium">
                  <span>{book.writtenCount}/{book.chapterCount} 章</span>
                  <span>{progress}%</span>
                </div>
                <div className="h-1 rounded-full bg-muted overflow-hidden">
                  <div 
                    className="h-full bg-foreground transition-all duration-500 ease-out" 
                    style={{ width: `${progress}%` }} 
                  />
                </div>
              </div>
              
              {/* Stats */}
              <div className="flex gap-4 text-[11px] text-muted-foreground font-medium">
                {book.stats.files > 0 && <span>{book.stats.files.toLocaleString()} 文件</span>}
                {book.stats.lines > 0 && <span>{book.stats.lines >= 1000 ? `${Math.round(book.stats.lines / 1000)}K` : book.stats.lines} 行</span>}
                {book.score > 0 && <span>评分 {book.score}/100</span>}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
