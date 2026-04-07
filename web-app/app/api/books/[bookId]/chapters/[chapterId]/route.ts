import { NextResponse } from "next/server";
import { loadChapters, loadBookIndex } from "@/lib/load-knowledge";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";

const execAsync = promisify(exec);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ bookId: string; chapterId: string }> }
) {
  try {
    const { bookId, chapterId } = await params;
    const chapters: Record<string, any> = loadChapters(bookId);
    const chapter = Object.values(chapters).find((ch) => ch.chapter_id === chapterId);
    
    if (!chapter) {
      return NextResponse.json({ error: "Chapter not found" }, { status: 404 });
    }
    
    return NextResponse.json(chapter);
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ bookId: string; chapterId: string }> }
) {
  try {
    const { bookId, chapterId } = await params;
    const index = loadBookIndex();
    const book = index.books.find(b => b.id === bookId);
    
    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    const harnessRoot = path.resolve(process.cwd(), "..");
    
    let projectYaml = `projects/${book.name}.yaml`;
    if (!fs.existsSync(path.join(harnessRoot, projectYaml))) {
      projectYaml = `projects/${bookId}.yaml`;
      if (!fs.existsSync(path.join(harnessRoot, projectYaml))) {
         const projectsDir = path.join(harnessRoot, "projects");
         const files = fs.readdirSync(projectsDir).filter(f => f.endsWith('.yaml'));
         for (const file of files) {
           const content = fs.readFileSync(path.join(projectsDir, file), 'utf-8');
           if (content.includes(`name: "${book.name}"`) || content.includes(`name: ${book.name}`)) {
             projectYaml = `projects/${file}`;
             break;
           }
         }
      }
    }

    try {
      const { stdout, stderr } = await execAsync(`python3 -m pyharness write --project "${projectYaml}" --chapter "${chapterId}"`, {
        cwd: harnessRoot,
      });
      
      const chapters: Record<string, any> = loadChapters(bookId);
      const chapter = Object.values(chapters).find((ch) => ch.chapter_id === chapterId);
      
      return NextResponse.json({ 
        success: true, 
        message: "Chapter rewritten successfully",
        chapter: chapter,
        output: stdout,
      });
    } catch (execError: any) {
      console.error("Execution error:", execError);
      return NextResponse.json({ 
        error: "Failed to rewrite chapter", 
        details: execError.stderr || execError.message 
      }, { status: 500 });
    }
  } catch (error) {
    return NextResponse.json({ error: "Failed to process request" }, { status: 400 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ bookId: string; chapterId: string }> }
) {
  try {
    const { bookId, chapterId } = await params;
    const index = loadBookIndex();
    const book = index.books.find(b => b.id === bookId);
    
    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    const harnessRoot = path.resolve(process.cwd(), "..");
    const chapterPath = path.join(harnessRoot, "knowledge", book.name, "chapters", `${chapterId}.json`);
    
    if (fs.existsSync(chapterPath)) {
      fs.unlinkSync(chapterPath);
      
      try {
        await execAsync(`bash scripts/rebuild-index.sh`, { cwd: harnessRoot });
      } catch (e) {
        console.error("Failed to rebuild index after deletion:", e);
      }
      
      return NextResponse.json({ success: true, message: "Chapter deleted successfully" });
    } else {
      return NextResponse.json({ error: "Chapter file not found" }, { status: 404 });
    }
  } catch (error) {
    return NextResponse.json({ error: "Failed to process request" }, { status: 500 });
  }
}
