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
    let targetRepoPath = repo_path;

    if (targetRepoPath.startsWith("http://") || targetRepoPath.startsWith("https://")) {
      const repoUrl = new URL(targetRepoPath);
      const parts = repoUrl.pathname.split("/").filter(Boolean);
      const repoName = parts[parts.length - 1]?.replace(".git", "");
      
      if (!repoName) {
        return NextResponse.json({ error: "Invalid Git URL" }, { status: 400 });
      }
      
      const workspacesDir = path.join(harnessRoot, "workspaces");
      targetRepoPath = path.join(workspacesDir, repoName);
      
      const fs = require("fs");
      if (!fs.existsSync(workspacesDir)) {
        fs.mkdirSync(workspacesDir, { recursive: true });
      }
      
      if (!fs.existsSync(targetRepoPath)) {
        console.log(`Cloning ${repo_path} into ${targetRepoPath}`);
        try {
          await execAsync(`git clone ${repo_path} ${targetRepoPath}`);
        } catch (cloneErr: any) {
          console.error("Git clone failed:", cloneErr);
          return NextResponse.json({ error: "Failed to clone repository", details: cloneErr.message }, { status: 500 });
        }
      } else {
        console.log(`Pulling latest changes for ${targetRepoPath}`);
        try {
          await execAsync(`git -C ${targetRepoPath} pull`);
        } catch (pullErr) {
          console.error("Git pull failed:", pullErr);
        }
      }
    }

    // Execute the pyharness init command
    try {
      const { stdout, stderr } = await execAsync(`python3 -m pyharness init "${targetRepoPath}"`, {
        cwd: harnessRoot,
      });
      
      // Rebuild index.json so the new book appears
      await execAsync("bash scripts/rebuild-index.sh", { cwd: harnessRoot });
      
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
