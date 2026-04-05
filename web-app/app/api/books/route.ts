import { NextResponse } from "next/server";
import { loadBookIndex, invalidateIndexCache } from "@/lib/load-knowledge";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";

const execAsync = promisify(exec);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  if (searchParams.get("refresh") === "true") {
    invalidateIndexCache();
  }
  try {
    const index = loadBookIndex();
    return NextResponse.json(index);
  } catch {
    return NextResponse.json({ error: "Failed to load book index" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { repo_path } = body;

    if (!repo_path || typeof repo_path !== "string") {
      return NextResponse.json({ error: "Invalid repo_path provided" }, { status: 400 });
    }

    // Determine the root of the harness (two levels up from web-app/app/api/books)
    const harnessRoot = path.resolve(process.cwd(), "..");

    // Execute the pyharness init command
    try {
      const { stdout, stderr } = await execAsync(`python3 -m pyharness init "${repo_path}"`, {
        cwd: harnessRoot,
      });
      
      invalidateIndexCache();
      
      return NextResponse.json({ 
        success: true, 
        message: "Book initialized successfully",
        output: stdout,
      });
    } catch (execError: any) {
      console.error("Execution error:", execError);
      return NextResponse.json({ 
        error: "Failed to initialize book", 
        details: execError.stderr || execError.message 
      }, { status: 500 });
    }
  } catch (error) {
    return NextResponse.json({ error: "Failed to parse request" }, { status: 400 });
  }
}
