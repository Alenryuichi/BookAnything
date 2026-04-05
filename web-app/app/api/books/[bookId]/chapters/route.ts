import { NextResponse } from "next/server";
import { loadChapters } from "@/lib/load-knowledge";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ bookId: string }> }
) {
  const { bookId } = await params;
  try {
    const chapters = loadChapters(bookId);
    if (Object.keys(chapters).length === 0) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }
    const summary = Object.entries(chapters).map(([id, ch]) => ({
      chapter_id: id,
      title: ch.title,
      subtitle: ch.subtitle,
      word_count: ch.word_count,
      sectionCount: ch.sections?.length ?? 0,
    }));
    return NextResponse.json({ chapters: summary });
  } catch {
    return NextResponse.json({ error: "Failed to load chapters" }, { status: 500 });
  }
}
