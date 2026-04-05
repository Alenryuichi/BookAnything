import { NextResponse } from "next/server";
import { jobManager } from "@/lib/job-manager";

export const dynamic = "force-dynamic";

const VALID_ACTIONS = new Set([
  "pause",
  "resume",
  "skip",
  "rewrite",
  "set-parallelism",
  "cancel",
]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;
  const job = jobManager.get(jobId);

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (job.state === "done" || job.state === "failed") {
    return NextResponse.json({ error: "Job already finished" }, { status: 409 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const action = body.action;
  if (typeof action !== "string" || !VALID_ACTIONS.has(action)) {
    return NextResponse.json(
      { error: `Invalid action. Must be one of: ${[...VALID_ACTIONS].join(", ")}` },
      { status: 400 },
    );
  }

  if ((action === "skip" || action === "rewrite") && !body.chapter) {
    return NextResponse.json(
      { error: `'chapter' field is required for action '${action}'` },
      { status: 400 },
    );
  }

  if (action === "set-parallelism") {
    const val = Number(body.value);
    if (!Number.isInteger(val) || val < 1 || val > 10) {
      return NextResponse.json(
        { error: "'value' must be an integer between 1 and 10" },
        { status: 400 },
      );
    }
  }

  const ok = jobManager.sendCommand(jobId, body);
  if (!ok) {
    return NextResponse.json({ error: "Failed to send command" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, action, ...body }, { status: 202 });
}
