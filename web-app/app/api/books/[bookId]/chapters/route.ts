import { NextResponse } from "next/server";
import { loadChapters, resolveBookDir } from "@/lib/load-knowledge";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ bookId: string }> }
) {
  const { bookId } = await params;
  try {
    if (!resolveBookDir(bookId)) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }
    const chapters = loadChapters(bookId);
    const summary = Object.entries(chapters).map(([id, ch]) => ({
      chapter_id: id,
      title: ch.title,
      subtitle: ch.subtitle,
      word_count: ch.word_count,
      sectionCount: ch.sections?.length ?? 0,
    }));
    return NextResponse.json({ chapters: summary });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to load chapters" }, { status: 500 });
  }
}
