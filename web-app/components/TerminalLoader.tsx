"use client";

import React, { useEffect, useState, useRef } from "react";

const TERMINAL_LOGS = [
  "Cloning remote repository...",
  "Resolving Git metadata and objects...",
  "Analyzing codebase AST and module structure...",
  "Discovering package.json and project boundaries...",
  "Mapping exported functions and classes...",
  "Inferring project language: TypeScript/JavaScript...",
  "Evaluating documentation coverage...",
  "Synthesizing chapter outlines and table of contents...",
  "Generating preliminary book scaffold...",
  "Allocating resources for Phase 1 code generation...",
  "Finalizing workspace index for BookAnything...",
  "Initialization complete. Yielding control...",
];

export function TerminalLoader({
  className = "",
  estimatedTimeMs = 40000,
}: {
  className?: string;
  estimatedTimeMs?: number;
}) {
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<string[]>([
    "> pyharness init --scan",
    "Initializing BookAnything sandboxed workspace...",
  ]);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Progress bar logic
  useEffect(() => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      // Approach 98% asymptotically over the estimated time
      const newProgress = Math.min(98, (elapsed / estimatedTimeMs) * 100);
      setProgress(newProgress);
    }, 100);
    return () => clearInterval(interval);
  }, [estimatedTimeMs]);

  // Terminal logs logic
  useEffect(() => {
    let currentIndex = 0;
    
    // Add logs periodically to simulate work
    const logInterval = setInterval(() => {
      if (currentIndex < TERMINAL_LOGS.length) {
        setLogs((prev) => [...prev, TERMINAL_LOGS[currentIndex]]);
        currentIndex++;
      } else {
        clearInterval(logInterval);
      }
    }, estimatedTimeMs / (TERMINAL_LOGS.length + 2)); // Spread logs evenly over the time

    return () => clearInterval(logInterval);
  }, [estimatedTimeMs]);

  // Auto-scroll to bottom of logs
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

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
          <div className="ml-4 text-xs text-slate-400 font-medium">bash - pyharness init</div>
        </div>
        
        {/* Terminal Body */}
        <div className="p-4 flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-1.5 text-slate-300 bg-[#0d1117]">
          {logs.map((log, i) => (
            <div 
              key={i} 
              className={`flex items-start gap-2 ${i === 0 ? "text-slate-400" : ""}`}
            >
              {i > 0 && <span className="text-green-400 shrink-0">➜</span>}
              <span className={i === logs.length - 1 && i !== 0 ? "text-white animate-pulse" : ""}>
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
            <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Scanning Repository...
          </span>
          <span className="font-bold text-blue-500 dark:text-blue-400">{Math.round(progress)}%</span>
        </div>
        <div className="w-full bg-slate-200 dark:bg-slate-700/50 rounded-full h-1.5 overflow-hidden relative shadow-inner">
          <div 
            className="bg-blue-500 h-1.5 rounded-full transition-all duration-100 ease-linear relative overflow-hidden" 
            style={{ width: `${progress}%` }}
          >
            <div 
              className="absolute top-0 bottom-0 left-0 w-[50px] bg-gradient-to-r from-transparent via-white/30 to-transparent"
              style={{ animation: "shimmer 1.5s infinite" }}
            />
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
