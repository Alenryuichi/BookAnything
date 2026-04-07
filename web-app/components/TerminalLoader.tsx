"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";

interface LogEntry {
  ts: string;
  level: string;
  msg: string;
  progress?: number;
  phase?: string;
}

const SIMULATED_LOGS = [
  "Cloning remote repository...",
  "Resolving Git metadata and objects...",
  "[scan] Scanning file tree and detecting language...",
  "[scan] Discovering package.json and project boundaries...",
  "[static-graph] Building deterministic structure graph (tree-sitter)...",
  "[static-graph] Extracting imports, call graph, class hierarchy...",
  "[yaml] Generating skeleton YAML...",
  "[analyze] Starting deep semantic analysis (Claude)...",
  "[analyze] Phase 1: Global concept discovery...",
  "[analyze] Phase 2: Batch semantic mapping...",
  "[analyze] Phase 3: Merging and consolidating graph...",
  "[analyze] Phase 4: Generating guided tours...",
  "[validate] Running graph quality checks...",
  "[graph-plan] Computing communities and topological order...",
  "[graph-plan] Claude polishing chapter titles and outlines...",
  "[yaml] Writing final YAML + chapter outline...",
  "Initialization complete. Yielding control...",
];

export function TerminalLoader({
  className = "",
  jobId,
  estimatedTimeMs = 40000,
  onDone,
  onError,
}: {
  className?: string;
  jobId?: string;
  estimatedTimeMs?: number;
  onDone?: () => void;
  onError?: (msg: string) => void;
}) {
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<string[]>([
    "> pyharness init --scan",
    "Initializing BookAnything sandboxed workspace...",
  ]);
  const [status, setStatus] = useState<"running" | "done" | "error">("running");
  const logsEndRef = useRef<HTMLDivElement>(null);
  const lastEventIdRef = useRef(0);

  const appendLog = useCallback((msg: string) => {
    setLogs((prev) => [...prev, msg]);
  }, []);

  // SSE mode: connect to real backend stream
  useEffect(() => {
    if (!jobId) return;

    const es = new EventSource(`/api/jobs/${jobId}/stream`);

    es.addEventListener("log", (e) => {
      if (e.lastEventId) {
        const id = parseInt(e.lastEventId, 10);
        if (id <= lastEventIdRef.current) return;
        lastEventIdRef.current = id;
      }
      try {
        const entry: LogEntry = JSON.parse(e.data);
        appendLog(entry.msg);
        if (entry.progress !== undefined) {
          setProgress(entry.progress);
        }
      } catch {}
    });

    es.addEventListener("done", (e) => {
      setProgress(100);
      setStatus("done");
      es.close();
      onDone?.();
    });

    es.addEventListener("error", (e) => {
      if (es.readyState === EventSource.CLOSED) {
        return;
      }
      try {
        const data = JSON.parse((e as MessageEvent).data);
        setStatus("error");
        es.close();
        onError?.(data.msg || "Job failed");
      } catch {
        // EventSource native reconnection — do nothing
      }
    });

    return () => {
      es.close();
    };
  }, [jobId, appendLog, onDone, onError]);

  // Simulated mode: fake logs when no jobId
  useEffect(() => {
    if (jobId) return;

    const startTime = Date.now();
    const progressInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      setProgress(Math.min(98, (elapsed / estimatedTimeMs) * 100));
    }, 100);

    let logIdx = 0;
    const logInterval = setInterval(() => {
      if (logIdx < SIMULATED_LOGS.length) {
        appendLog(SIMULATED_LOGS[logIdx]);
        logIdx++;
      } else {
        clearInterval(logInterval);
      }
    }, estimatedTimeMs / (SIMULATED_LOGS.length + 2));

    return () => {
      clearInterval(progressInterval);
      clearInterval(logInterval);
    };
  }, [jobId, estimatedTimeMs, appendLog]);

  // Auto-scroll
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  const levelColor = (msg: string) => {
    if (msg.startsWith(">")) return "text-slate-400";
    return "";
  };

  const isError = status === "error";
  const isDone = status === "done";

  return (
    <div className={`w-full flex flex-col gap-4 ${className}`}>
      {/* Terminal Window */}
      <div className="w-full bg-[#0d1117] rounded-lg border border-slate-700/50 shadow-xl overflow-hidden font-mono text-sm h-64 flex flex-col">
        {/* Terminal Header */}
        <div className="flex items-center px-4 py-2 bg-white/5 border-b border-white/5 shrink-0">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500/80" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
            <div className="w-3 h-3 rounded-full bg-green-500/80" />
          </div>
          <div className="ml-4 text-xs text-slate-400 font-medium">
            bash — pyharness init
            {jobId && <span className="ml-2 text-slate-600">({jobId.slice(0, 8)})</span>}
          </div>
        </div>

        {/* Terminal Body */}
        <div className="p-4 flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-1.5 text-slate-300 bg-[#0d1117]">
          {logs.map((log, i) => (
            <div
              key={i}
              className={`flex items-start gap-2 ${levelColor(log)}`}
            >
              {i > 0 && <span className="text-green-400 shrink-0">➜</span>}
              <span className={i === logs.length - 1 && i !== 0 && status === "running" ? "text-white animate-pulse" : ""}>
                {log}
              </span>
            </div>
          ))}
          <div ref={logsEndRef} className="h-1 shrink-0" />
        </div>
      </div>

      {/* Progress Bar Section */}
      <div className="flex flex-col gap-2 px-1">
        <div className="flex justify-between items-center text-xs font-mono text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-2">
            {status === "running" && (
              <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            )}
            {isDone ? "Complete!" : isError ? "Failed" : "Scanning Repository..."}
          </span>
          <span className={`font-bold ${isError ? "text-red-500" : isDone ? "text-green-500" : "text-blue-500 dark:text-blue-400"}`}>
            {Math.round(progress)}%
          </span>
        </div>
        <div className="w-full bg-slate-200 dark:bg-slate-700/50 rounded-full h-1.5 overflow-hidden relative shadow-inner">
          <div
            className={`h-1.5 rounded-full transition-all duration-300 ease-linear relative overflow-hidden ${
              isError ? "bg-red-500" : isDone ? "bg-green-500" : "bg-blue-500"
            }`}
            style={{ width: `${progress}%` }}
          >
            {status === "running" && (
              <div
                className="absolute top-0 bottom-0 left-0 w-[50px] bg-gradient-to-r from-transparent via-white/30 to-transparent"
                style={{ animation: "shimmer 1.5s infinite" }}
              />
            )}
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes shimmer {
          0% { transform: translateX(-50px); }
          100% { transform: translateX(800px); }
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(0,0,0,0.1);
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255,255,255,0.2);
        }
      `}} />
    </div>
  );
}
