export const dynamic = "force-dynamic";

import { existsSync, readFileSync, mkdirSync } from "fs";
import { resolve, isAbsolute, dirname } from "path";
import { NextResponse } from "next/server";
import { findProjectYaml } from "@/lib/load-knowledge";
import { jobManager } from "@/lib/job-manager";

function parseYamlField(content: string, field: string): string | null {
  const re = new RegExp(`^${field}:\\s*"?([^"\\n]+)"?`, "m");
  const match = content.match(re);
  return match ? match[1].trim() : null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ bookId: string }> },
) {
  const { bookId } = await params;
  const harnessRoot = resolve(process.cwd(), "..");

  const yamlPath = findProjectYaml(bookId);
  if (!yamlPath) {
    return NextResponse.json(
      { error: "Project YAML not found" },
      { status: 404 },
    );
  }

  let content: string;
  try {
    content = readFileSync(yamlPath, "utf-8");
  } catch {
    return NextResponse.json(
      { error: "Failed to read project YAML" },
      { status: 500 },
    );
  }

  const rawRepoPath = parseYamlField(content, "repo_path");
  const yamlRemoteUrl = parseYamlField(content, "remote_url");

  if (!rawRepoPath) {
    return NextResponse.json(
      { error: "No repo_path in project YAML" },
      { status: 500 },
    );
  }

  let body: { remoteUrl?: string } = {};
  try {
    body = await request.json();
  } catch {}

  const remoteUrl = body.remoteUrl || yamlRemoteUrl;

  if (!remoteUrl) {
    return NextResponse.json(
      { error: "No remote_url provided or configured" },
      { status: 400 },
    );
  }

  const resolvedPath = isAbsolute(rawRepoPath)
    ? rawRepoPath
    : resolve(harnessRoot, rawRepoPath);

  if (existsSync(resolvedPath)) {
    return NextResponse.json(
      { error: "Repository already exists", repoPath: resolvedPath },
      { status: 409 },
    );
  }

  const parentDir = dirname(resolvedPath);
  if (!existsSync(parentDir)) {
    mkdirSync(parentDir, { recursive: true });
  }

  const job = jobManager.spawn(
    "git",
    ["clone", remoteUrl, resolvedPath],
    harnessRoot,
    { bookId, jobType: "reclone" },
  );

  return NextResponse.json(
    { jobId: job.id, repoPath: resolvedPath },
    { status: 202 },
  );
}
