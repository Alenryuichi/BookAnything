"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  useAnalyzeProgress,
  type StageInfo,
  type LogEntry,
} from "./hooks/useAnalyzeProgress";
import {
  CheckCircle2,
  Circle,
  Loader2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
} from "lucide-react";

interface Props {
  bookId: string;
  jobId: string;
  onComplete: () => void;
}

function StageIcon({ status }: { status: StageInfo["status"] }) {
  if (status === "complete")
    return <CheckCircle2 className="w-5 h-5 text-emerald-500 fill-emerald-50" strokeWidth={1.5} />;
  if (status === "active")
    return (
      <div className="relative flex items-center justify-center w-5 h-5">
        <div className="absolute inset-0 border-2 border-blue-500/20 rounded-full" />
        <div className="absolute inset-0 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
      </div>
    );
  return <div className="w-5 h-5 rounded-full border-2 border-muted/50 bg-background" />;
}

function TerminalLogViewer({ logs }: { logs: LogEntry[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs.length]);

  if (logs.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-[#0a0a0a] overflow-hidden flex flex-col">
      <div className="bg-[#1a1a1a] px-4 py-2 border-b border-[#2a2a2a] flex items-center gap-2">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
        </div>
        <span className="text-[10px] text-muted-foreground font-mono ml-2 uppercase tracking-wider">
          Analyze Output
        </span>
      </div>
      <div
        ref={containerRef}
        className="p-4 h-48 overflow-y-auto font-mono text-[11px] leading-relaxed text-gray-300"
      >
        {logs.map((l, i) => {
          let msg = l.msg || "";
          msg = msg.replace(/\x1b\[[0-9;]*m/g, "");
          if (!msg && l.event) msg = `[event] ${l.event}`;
          if (!msg) return null;

          const isErr = l.level === "ERROR";
          const isHead = l.level === "HEAD";
          const isOk = l.level === "OK";

          return (
            <div
              key={i}
              className="mb-0.5 flex gap-3 hover:bg-white/5 px-1 -mx-1 rounded"
            >
              {l.ts && (
                <span className="text-gray-500 shrink-0 w-16">{l.ts}</span>
              )}
              {l.level && (
                <span
                  className={`shrink-0 w-12 font-bold ${
                    isErr
                      ? "text-red-400"
                      : isOk
                        ? "text-green-400"
                        : isHead
                          ? "text-blue-400"
                          : "text-purple-400"
                  }`}
                >
                  {l.level}
                </span>
              )}
              <span
                className={`break-all ${
                  isErr
                    ? "text-red-300"
                    : isHead
                      ? "text-blue-300 font-bold"
                      : "text-gray-300"
                }`}
              >
                {msg}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AnalyzeProgress({ bookId, jobId, onComplete }: Props) {
  const progress = useAnalyzeProgress(jobId);
  const [showDone, setShowDone] = useState(false);

  useEffect(() => {
    if (progress.done && !progress.error) {
      setShowDone(true);
      const t = setTimeout(() => onComplete(), 1200);
      return () => clearTimeout(t);
    }
  }, [progress.done, progress.error, onComplete]);

  const handleRetry = useCallback(async () => {
    try {
      const res = await fetch(`/api/books/${bookId}/analyze`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        window.location.href = `/books/${bookId}/explore?jobId=${data.jobId}`;
      }
    } catch {}
  }, [bookId]);

  if (showDone) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-56px)] gap-4 px-4">
        <Sparkles className="w-12 h-12 text-emerald-400 animate-pulse" />
        <p className="text-lg font-semibold text-emerald-400">
          Analysis complete!
        </p>
        <p className="text-sm text-muted-foreground">
          Loading knowledge graph...
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-[calc(100vh-56px)] gap-6 px-4 overflow-y-auto py-8">
      <div className="w-full max-w-[600px] bg-background border border-border shadow-sm rounded-xl overflow-hidden">
        {/* Header Area */}
        <div className="px-8 pt-8 pb-6 border-b border-border/50 bg-muted/20">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
              <Sparkles className="w-6 h-6 text-blue-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Analyzing Repository</h2>
              <p className="text-sm text-muted-foreground">
                Building knowledge graph from source code
              </p>
            </div>
          </div>

          {/* Overall progress bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-medium text-muted-foreground">
              <span>Overall progress</span>
              <span className="text-foreground">{progress.overallProgress}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden relative">
              <div
                className="absolute top-0 left-0 h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-500 ease-out"
                style={{ width: `${progress.overallProgress}%` }}
              />
            </div>
          </div>
        </div>

        {/* Steps Area */}
        <div className="px-8 py-6 bg-background">
          <div className="space-y-0 max-w-md mx-auto">
            {progress.stages.map((stage, i) => (
              <div key={stage.id} className="flex items-start gap-4 relative">
                {i < progress.stages.length - 1 && (
                  <div
                    className={`absolute left-[9px] top-6 w-[2px] h-[calc(100%-4px)] ${
                      stage.status === "complete"
                        ? "bg-emerald-500/30"
                        : "bg-muted"
                    }`}
                  />
                )}
                <div className="mt-0.5 z-10 bg-background rounded-full">
                  <StageIcon status={stage.status} />
                </div>
                <div className="flex-1 pb-5">
                  <p
                    className={`text-sm font-medium ${
                      stage.status === "active"
                        ? "text-foreground"
                        : stage.status === "complete"
                          ? "text-foreground"
                          : "text-muted-foreground/60"
                    }`}
                  >
                    {stage.label}
                  </p>
                  {stage.detail && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {stage.detail}
                    </p>
                  )}
                  {stage.id === "analyzing" &&
                    stage.status === "active" &&
                    progress.batchTotal > 0 && (
                      <div className="mt-2.5 p-3 rounded-lg border border-border bg-muted/30 space-y-2">
                        <div className="flex justify-between text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                          <span>Processing Batches</span>
                          <span>{progress.batchComplete} / {progress.batchTotal}</span>
                        </div>
                        <div className="h-1 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-blue-500 transition-all duration-300"
                            style={{
                              width: `${Math.round((progress.batchComplete / progress.batchTotal) * 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                    )}
                </div>
              </div>
            ))}
          </div>

          {/* File scan stats */}
          {progress.filesFound > 0 && (
            <div className="mt-2 text-center text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted">
                Found {progress.filesFound} files
                {progress.filesSkipped > 0 && ` (skipped ${progress.filesSkipped})`}
              </span>
            </div>
          )}
        </div>

        {/* error state */}
        {progress.error && (
          <div className="mx-8 mb-6 p-4 rounded-xl bg-destructive/10 border border-destructive/20 flex flex-col items-center gap-3">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-sm font-medium">{progress.error}</span>
            </div>
            <button
              onClick={handleRetry}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Retry Analysis
            </button>
          </div>
        )}
      </div>

      {/* terminal log viewer (outside the main card) */}
      <div className="w-full">
        <TerminalLogViewer logs={progress.rawLogs} />
      </div>

      {!progress.error && (
        <p className="text-center text-xs text-muted-foreground">
          This may take a few minutes for large repositories.
        </p>
      )}
    </div>
  );
}
