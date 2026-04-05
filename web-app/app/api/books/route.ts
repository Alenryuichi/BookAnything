import { NextResponse } from "next/server";
import { loadBookIndex, invalidateIndexCache } from "@/lib/load-knowledge";
import { jobManager } from "@/lib/job-manager";
import { exec } from "child_process";
import { promisify } from "util";
import { existsSync, mkdirSync } from "fs";
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

    const harnessRoot = path.resolve(process.cwd(), "..");
    let targetRepoPath = repo_path;
    const isRemote = targetRepoPath.startsWith("http://") || targetRepoPath.startsWith("https://");

    if (isRemote) {
      try {
        const repoUrl = new URL(targetRepoPath);
        const parts = repoUrl.pathname.split("/").filter(Boolean);
        const repoName = parts[parts.length - 1]?.replace(".git", "");
        if (!repoName) {
          return NextResponse.json({ error: "Invalid Git URL" }, { status: 400 });
        }
        targetRepoPath = path.join(harnessRoot, "workspaces", repoName);

        const workspacesDir = path.join(harnessRoot, "workspaces");
        if (!existsSync(workspacesDir)) {
          mkdirSync(workspacesDir, { recursive: true });
        }
      } catch {
        return NextResponse.json({ error: "Invalid Git URL" }, { status: 400 });
      }
    }

    const onComplete = async () => {
      try {
        await execAsync("bash scripts/rebuild-index.sh", { cwd: harnessRoot });
        invalidateIndexCache();
      } catch (e) {
        console.error("[POST /api/books] rebuild-index failed:", e);
      }
    };

    const scriptParts: string[] = [];
    scriptParts.push(`cd "${harnessRoot}"`);
    scriptParts.push(`mkdir -p output/logs`);

    if (isRemote) {
      scriptParts.push(`
if [ ! -d "${targetRepoPath}" ]; then
  echo '{"ts":"'$(date +%H:%M:%S)'","level":"INFO","msg":"Cloning repository...","progress":2,"phase":"clone"}'
  git clone "${repo_path}" "${targetRepoPath}" 2>&1
  echo '{"ts":"'$(date +%H:%M:%S)'","level":"OK","msg":"Clone complete","progress":5,"phase":"clone"}'
else
  echo '{"ts":"'$(date +%H:%M:%S)'","level":"INFO","msg":"Repository exists, pulling latest...","progress":2,"phase":"clone"}'
  git -C "${targetRepoPath}" pull 2>&1 || true
  echo '{"ts":"'$(date +%H:%M:%S)'","level":"OK","msg":"Pull complete","progress":5,"phase":"clone"}'
fi`);
    }

    scriptParts.push(
      `python3 -m pyharness init "${targetRepoPath}" --log-sink "$SINK_PATH"`,
    );

    // NOTE: For future `pyharness run` commands, pass --control-file "$CONTROL_PATH"
    // alongside --log-sink "$SINK_PATH". The init command does not use control files.

    const job = jobManager.spawn(
      "bash",
      ["-c", scriptParts.join("\n")],
      harnessRoot,
      { onComplete },
    );

    return NextResponse.json({ jobId: job.id }, { status: 202 });
  } catch (error: any) {
    if (error?.message?.includes("Too many active jobs")) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }
    return NextResponse.json({ error: "Failed to parse request" }, { status: 400 });
  }
}
