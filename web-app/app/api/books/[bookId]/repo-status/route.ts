export const dynamic = "force-dynamic";

import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve, isAbsolute } from "path";
import { NextResponse } from "next/server";
import { findProjectYaml } from "@/lib/load-knowledge";

function parseYamlField(content: string, field: string): string | null {
  const re = new RegExp(`^${field}:\\s*"?([^"\\n]+)"?`, "m");
  const match = content.match(re);
  return match ? match[1].trim() : null;
}

function buildRepoStatus(content: string, harnessRoot: string) {
  const rawRepoPath = parseYamlField(content, "repo_path");
  const remoteUrl = parseYamlField(content, "remote_url");

  if (!rawRepoPath) return null;

  const resolvedPath = isAbsolute(rawRepoPath)
    ? rawRepoPath
    : resolve(harnessRoot, rawRepoPath);

  const exists = existsSync(resolvedPath);

  return {
    exists,
    repoPath: resolvedPath,
    remoteUrl: remoteUrl || null,
    canReclone: !exists && !!remoteUrl,
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ bookId: string }> },
) {
  const { bookId } = await params;
  const harnessRoot = resolve(process.cwd(), "..");

  const yamlPath = findProjectYaml(bookId);
  if (!yamlPath) {
    return NextResponse.json(
      { error: "Project YAML not found", bookId },
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

  const status = buildRepoStatus(content, harnessRoot);
  if (!status) {
    return NextResponse.json(
      { error: "No repo_path in project YAML" },
      { status: 500 },
    );
  }

  return NextResponse.json(status);
}

export async function PATCH(
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

  const body = await request.json();
  const { remoteUrl, repoPath } = body as {
    remoteUrl?: string;
    repoPath?: string;
  };

  if (!remoteUrl && !repoPath) {
    return NextResponse.json(
      { error: "Provide remoteUrl or repoPath" },
      { status: 400 },
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

  if (remoteUrl) {
    const remoteUrlLine = `remote_url: "${remoteUrl}"`;
    if (/^remote_url:/m.test(content)) {
      content = content.replace(/^remote_url:.*$/m, remoteUrlLine);
    } else {
      content = content.replace(
        /^(repo_path:.*$)/m,
        `$1\n${remoteUrlLine}`,
      );
    }
  }

  if (repoPath) {
    content = content.replace(
      /^repo_path:.*$/m,
      `repo_path: "${repoPath}"`,
    );
  }

  try {
    writeFileSync(yamlPath, content, "utf-8");
  } catch {
    return NextResponse.json(
      { error: "Failed to write project YAML" },
      { status: 500 },
    );
  }

  const status = buildRepoStatus(content, harnessRoot);
  return NextResponse.json({ updated: true, ...status });
}
