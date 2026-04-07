export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { jobManager } from "@/lib/job-manager";
import {
  findProjectYaml,
  resolveBookDir,
  invalidateIndexCache,
} from "@/lib/load-knowledge";
import { existsSync, unlinkSync, rmSync } from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ bookId: string }> },
) {
  const { bookId } = await params;
  const harnessRoot = path.resolve(process.cwd(), "..");
  const workspacesDir = path.join(harnessRoot, "workspaces");

  try {
    // 1. Cancel any active jobs
    const activeAnalyzeJob = jobManager.findActiveByBook(bookId, "analyze");
    if (activeAnalyzeJob) {
      jobManager.sendCommand(activeAnalyzeJob.id, { action: "cancel" });
    }
    const activeGenerateJob = jobManager.findActiveByBook(bookId, "generate");
    if (activeGenerateJob) {
      jobManager.sendCommand(activeGenerateJob.id, { action: "cancel" });
    }

    // Give processes a brief moment to exit
    await new Promise((resolve) => setTimeout(resolve, 500));

    // 2. Delete project YAML
    const yamlPath = findProjectYaml(bookId);
    if (yamlPath && existsSync(yamlPath)) {
      unlinkSync(yamlPath);
    }

    // 3. Delete knowledge directory
    const bookDir = resolveBookDir(bookId);
    if (bookDir && existsSync(bookDir)) {
      rmSync(bookDir, { recursive: true, force: true });
    }

    // 4. Safe workspace deletion
    // Try to derive the repoName or repoPath from the YAML (if we still have access to the name)
    // Actually, the workspaces are named by either repoName or the bookId.
    // In most cases, bookDir exists in knowledge/<dirName>. We can check if workspaces/<dirName> exists.
    let workspaceName = bookId;
    if (bookDir) {
      workspaceName = path.basename(bookDir);
    }
    const targetWorkspacePath = path.join(workspacesDir, workspaceName);
    
    // Ensure the resolved path strictly starts with the workspaces directory
    if (
      targetWorkspacePath.startsWith(workspacesDir) &&
      targetWorkspacePath !== workspacesDir && // Do not delete the workspaces folder itself
      existsSync(targetWorkspacePath)
    ) {
      rmSync(targetWorkspacePath, { recursive: true, force: true });
    }

    // 5. Trigger index rebuild
    await execAsync("bash scripts/rebuild-index.sh", { cwd: harnessRoot });
    invalidateIndexCache();

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    console.error(`[DELETE /api/books/${bookId}] Error:`, error);
    return NextResponse.json(
      { error: "Failed to complete deletion", details: error.message },
      { status: 500 },
    );
  }
}
