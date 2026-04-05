import { jobManager } from "@/lib/job-manager";
import type { LogEntry } from "@/lib/job-manager";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;
  const job = jobManager.get(jobId);

  if (!job) {
    return new Response(JSON.stringify({ error: "Job not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const lastEventId = parseInt(
    request.headers.get("Last-Event-ID") ?? "0",
    10,
  );

  const encoder = new TextEncoder();
  let eventId = 0;
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      const send = (eventName: string, data: string) => {
        if (closed) return;
        eventId++;
        try {
          controller.enqueue(
            encoder.encode(`id: ${eventId}\nevent: ${eventName}\ndata: ${data}\n\n`),
          );
        } catch {}
      };

      for (const entry of job.logs) {
        eventId++;
        if (eventId <= lastEventId) continue;
        try {
          controller.enqueue(
            encoder.encode(
              `id: ${eventId}\nevent: log\ndata: ${JSON.stringify(entry)}\n\n`,
            ),
          );
        } catch {}
      }

      if (job.state === "done" || job.state === "failed") {
        const terminalEvent = job.state === "done" ? "done" : "error";
        send(terminalEvent, JSON.stringify({
          state: job.state,
          exitCode: job.exitCode,
          progress: job.progress,
        }));
        try { controller.close(); } catch {}
        return;
      }

      const unsubscribe = jobManager.subscribe(jobId, (entry: LogEntry) => {
        if (closed) return;
        send("log", JSON.stringify(entry));
      });

      const checkDone = setInterval(() => {
        const current = jobManager.get(jobId);
        if (!current || current.state === "done" || current.state === "failed") {
          clearInterval(checkDone);
          const terminalEvent = current?.state === "done" ? "done" : "error";
          send(terminalEvent, JSON.stringify({
            state: current?.state ?? "failed",
            exitCode: current?.exitCode,
            progress: current?.progress ?? 0,
          }));
          unsubscribe();
          closed = true;
          try { controller.close(); } catch {}
        }
      }, 1000);

      request.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(checkDone);
        unsubscribe();
        try { controller.close(); } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
