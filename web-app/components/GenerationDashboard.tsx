"use client";

import { useEffect, useReducer, useRef, useCallback } from "react";
import Link from "next/link";

const PHASES = [
  { key: "plan", label: "Plan" },
  { key: "write", label: "Write" },
  { key: "improve", label: "Improve" },
  { key: "review", label: "Review" },
  { key: "build", label: "Build" },
  { key: "visual_test", label: "Visual Test" },
  { key: "evaluate", label: "Evaluate" },
] as const;

type ChapterStatus = "waiting" | "writing" | "done" | "failed";
interface ChapterState { id: string; title: string; status: ChapterStatus; wordCount: number; elapsedMs: number; error?: string; errorClass?: string; errorAttempt?: number; errorMaxAttempts?: number; }
interface EvalScores { score: number; content: number; visual: number; interaction: number; }
interface DashboardState { plan: Record<string, any> | null; iteration: number; maxIterations: number; score: number; elapsedH: number; activePhaseIndex: number; completedPhases: Set<number>; chapters: Map<string, ChapterState>; eval: EvalScores | null; status: "connecting" | "running" | "done" | "error"; isPaused?: boolean; rawLogs: Array<Record<string, unknown>>; }

type Action =
  | { type: "iteration_start"; payload: Record<string, unknown> }
  | { type: "plan_result"; payload: Record<string, unknown> }
  | { type: "phase_change"; payload: Record<string, unknown> }
  | { type: "chapter_status"; payload: Record<string, unknown> }
  | { type: "eval_result"; payload: Record<string, unknown> }
  | { type: "chapter_error"; payload: Record<string, unknown> }
  | { type: "raw_log"; payload: Record<string, unknown> }
  | { type: "done" } | { type: "error" } | { type: "connected" } | { type: "set_paused"; payload: boolean };

function reducer(state: DashboardState, action: Action): DashboardState {
  switch (action.type) {
    case "connected": return { ...state, status: "running" };
    case "plan_result": { return { ...state, plan: action.payload as Record<string, any> }; }
    case "iteration_start": { const p = action.payload; return { ...state, iteration: (p.iteration as number) ?? state.iteration, maxIterations: (p.max_iterations as number) ?? state.maxIterations, score: (p.score as number) ?? state.score, elapsedH: (p.elapsed_h as number) ?? state.elapsedH, activePhaseIndex: 0, completedPhases: new Set() }; }
    case "phase_change": { const p = action.payload; const idx = ((p.phase_index as number) ?? 1) - 1; const completed = new Set(state.completedPhases); for (let i = 0; i < idx; i++) completed.add(i); return { ...state, activePhaseIndex: idx, completedPhases: completed }; }
    case "chapter_status": { const p = action.payload; const chId = p.chapter_id as string; if (!chId) return state; const chapters = new Map(state.chapters); const existing = chapters.get(chId) ?? { id: chId, title: chId, status: "waiting" as ChapterStatus, wordCount: 0, elapsedMs: 0 }; chapters.set(chId, { ...existing, status: (p.status as ChapterStatus) ?? existing.status, wordCount: (p.word_count as number) ?? existing.wordCount, elapsedMs: (p.elapsed_ms as number) ?? existing.elapsedMs, error: p.error as string | undefined }); return { ...state, chapters }; }
    case "eval_result": { const p = action.payload; const completed = new Set(state.completedPhases); for (let i = 0; i < 7; i++) completed.add(i); return { ...state, eval: { score: (p.score as number) ?? 0, content: (p.content as number) ?? 0, visual: (p.visual as number) ?? 0, interaction: (p.interaction as number) ?? 0 }, score: (p.score as number) ?? state.score, completedPhases: completed, activePhaseIndex: 7 }; }
    case "chapter_error": { const p = action.payload; const chId = p.chapter_id as string; if (!chId) return state; const chapters = new Map(state.chapters); const existing = chapters.get(chId) ?? { id: chId, title: chId, status: "failed" as ChapterStatus, wordCount: 0, elapsedMs: 0 }; chapters.set(chId, { ...existing, errorClass: p.error_class as string, errorAttempt: p.attempt as number, errorMaxAttempts: p.max_attempts as number, error: p.message as string }); return { ...state, chapters }; }
    case "raw_log": return { ...state, rawLogs: [...state.rawLogs, action.payload].slice(-200) };
    case "done": return { ...state, status: "done" };
    case "error": return { ...state, status: "error" };
    case "set_paused": return { ...state, isPaused: action.payload };
    default: return state;
  }
}

function processLogEntry(entry: Record<string, unknown>, dispatch: React.Dispatch<Action>) {
  const eventType = entry.type as string | undefined;
  if (eventType && ["iteration_start", "phase_change", "chapter_status", "eval_result", "plan_result", "chapter_error"].includes(eventType)) {
    dispatch({ type: eventType as any, payload: entry });
  } else {
    // Intercept SIGSTOP/SIGCONT logs to update UI state
    if (entry.msg === 'Generation paused via SIGSTOP') dispatch({ type: 'set_paused', payload: true });
    if (entry.msg === 'Generation resumed via SIGCONT') dispatch({ type: 'set_paused', payload: false });
    dispatch({ type: "raw_log", payload: entry });
  }
}

export function GenerationDashboard({ jobId, bookId, chapters: initialChapters }: { jobId: string; bookId: string; chapters: { id: string; title: string }[] }) {
  const initState: DashboardState = { plan: null, iteration: 0, maxIterations: 3, score: 0, elapsedH: 0, activePhaseIndex: -1, completedPhases: new Set(), chapters: new Map(initialChapters.map((c) => [c.id, { id: c.id, title: c.title, status: "waiting" as ChapterStatus, wordCount: 0, elapsedMs: 0 }])), eval: null, status: "connecting", rawLogs: [] };
  const [state, dispatch] = useReducer(reducer, initState);
  const esRef = useRef<EventSource | null>(null);
  const startStream = useCallback((_n: number) => {
    const es = new EventSource(`/api/jobs/${jobId}/stream`);
    esRef.current = es;
    es.addEventListener("log", (e: MessageEvent) => { try { processLogEntry(JSON.parse(e.data), dispatch); } catch {} });
    es.addEventListener("done", () => { dispatch({ type: "done" }); es.close(); });
    es.addEventListener("error", () => { if (es.readyState === EventSource.CLOSED) dispatch({ type: "error" }); });
    es.onopen = () => dispatch({ type: "connected" });
  }, [jobId]);
  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        if (!res.ok) { dispatch({ type: "error" }); return; }
        const data = await res.json();
        if (!cancelled) {
          for (const entry of data.logs ?? []) processLogEntry(entry, dispatch);
          if (data.state === "done") { dispatch({ type: "done" }); return; }
          if (data.state === "failed") { dispatch({ type: "error" }); return; }
          startStream((data.logs ?? []).length);
        }
      } catch { if (!cancelled) dispatch({ type: "error" }); }
    }
    init();
    return () => { cancelled = true; esRef.current?.close(); };
  }, [jobId, startStream]);
  return (
    <div className="space-y-8">
      <IterationHeader state={state} jobId={jobId} />
      <PhaseTimeline state={state} />
      <PlanCard state={state} />
      <ChapterGrid state={state} jobId={jobId} />
      {state.eval && <EvalSection scores={state.eval} />}
      <TerminalLogViewer logs={state.rawLogs} />
      {state.status === "done" && (<div className="rounded-lg border border-green-500/30 bg-green-500/5 p-6 text-center"><div className="text-lg font-bold text-green-600 dark:text-green-400 mb-2">Generation Complete</div><p className="text-sm text-muted-foreground mb-4">Final score: {state.score}/100</p><Link href={`/books/${bookId}`} className="inline-block px-5 py-2.5 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity">View Book →</Link></div>)}
      {state.status === "error" && (<div className="rounded-lg border border-red-500/30 bg-red-500/5 p-6 text-center"><div className="text-lg font-bold text-red-600 dark:text-red-400 mb-2">Generation Failed</div><p className="text-sm text-muted-foreground mb-4">An error occurred during generation.</p><button onClick={() => window.location.reload()} className="px-5 py-2.5 rounded-lg border border-border bg-card text-sm font-medium hover:border-foreground transition-colors">Retry</button></div>)}
    </div>
  );
}

import { useState as useStateLocal } from "react";

function IterationHeader({ state, jobId }: { state: DashboardState; jobId: string }) {
  const [pending, setPending] = useStateLocal<string | null>(null);

  const sendCommand = async (action: string) => {
    if (pending) return;
    setPending(action);
    try {
      await fetch(`/api/jobs/${jobId}/control`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      setTimeout(() => setPending(null), 1000);
    } catch (e) {
      console.error("Failed to send command", e);
      setPending(null);
    }
  };

  return (
    <div className="flex items-baseline justify-between flex-wrap gap-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight flex items-center gap-3">
          <span>Iteration {state.iteration || "—"} <span className="text-muted-foreground font-normal text-lg">/ {state.maxIterations}</span></span>
          {state.status === "done" && <span className="px-2.5 py-0.5 rounded-full bg-green-500/10 text-green-600 border border-green-500/20 text-sm font-medium">Completed</span>}
          {state.status === "error" && <span className="px-2.5 py-0.5 rounded-full bg-red-500/10 text-red-600 border border-red-500/20 text-sm font-medium">Failed</span>}
        </h1>
        {state.elapsedH > 0 && <p className="text-sm text-muted-foreground mt-1">Elapsed: {state.elapsedH.toFixed(2)}h</p>}
        {state.status === "running" && (
          <div className="flex items-center gap-2 mt-3 bg-muted/30 p-1.5 rounded-lg border border-border/50 inline-flex">
            <button 
              onClick={() => sendCommand("pause")} 
              disabled={!!pending}
              className={`px-4 py-1.5 text-xs font-medium rounded-md transition-all ${pending === 'pause' ? 'bg-amber-500 text-white shadow-sm' : 'text-amber-600 hover:bg-amber-500/10'}`}
            >
              {pending === 'pause' ? 'Pausing...' : 'Pause'}
            </button>
            <div className="w-px h-4 bg-border"></div>
            <button 
              onClick={() => sendCommand("resume")} 
              disabled={!!pending}
              className={`px-4 py-1.5 text-xs font-medium rounded-md transition-all ${pending === 'resume' ? 'bg-green-500 text-white shadow-sm' : 'text-green-600 hover:bg-green-500/10'}`}
            >
              {pending === 'resume' ? 'Resuming...' : 'Resume'}
            </button>
            <div className="w-px h-4 bg-border"></div>
            <button 
              onClick={() => sendCommand("cancel")} 
              disabled={!!pending}
              className={`px-4 py-1.5 text-xs font-medium rounded-md transition-all ${pending === 'cancel' ? 'bg-red-500 text-white shadow-sm' : 'text-red-600 hover:bg-red-500/10'}`}
            >
              {pending === 'cancel' ? 'Canceling...' : 'Cancel'}
            </button>
          </div>
        )}
      </div>
      <div className="text-right">
        <div className="text-3xl font-bold tabular-nums">{state.score}</div>
        <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">score / 100</div>
      </div>
    </div>
  );
}
function PhaseTimeline({ state }: { state: DashboardState }) {
  return (<div className="flex items-center gap-1 overflow-x-auto pb-2">{PHASES.map((phase, i) => {const isActive = i === state.activePhaseIndex; const isDone = state.completedPhases.has(i); const showSpinner = isActive && !state.isPaused; return (<div key={phase.key} className="flex items-center"><div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${isActive ? "bg-foreground text-background" : isDone ? "bg-green-500/10 text-green-600 dark:text-green-400" : "bg-muted text-muted-foreground"}`}>{isDone ? (<svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>) : showSpinner ? (<svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>) : isActive && state.isPaused ? (<svg className="w-3.5 h-3.5 opacity-50" viewBox="0 0 24 24" fill="none"><rect x="6" y="5" width="4" height="14" fill="currentColor"/><rect x="14" y="5" width="4" height="14" fill="currentColor"/></svg>) : (<span className="w-3.5 h-3.5 flex items-center justify-center text-[10px]">{i + 1}</span>)}{phase.label}</div>{i < PHASES.length - 1 && <div className={`w-4 h-px mx-0.5 ${isDone ? "bg-green-500/40" : "bg-border"}`} />}</div>);})}</div>);
}

function ChapterGrid({ state, jobId }: { state: DashboardState; jobId: string }) {
  const chapters = [...state.chapters.values()];
  if (chapters.length === 0) return null;
  return (<div><h2 className="text-xs font-bold uppercase tracking-wider mb-4 text-muted-foreground">Chapters</h2><div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">{chapters.map((ch) => <ChapterCard key={ch.id} chapter={ch} jobId={jobId} status={state.status} />)}</div></div>);
}

function ChapterCard({ chapter, jobId, status }: { chapter: ChapterState; jobId: string; status: DashboardState["status"] }) {
  const sendCommand = async (action: string) => {
    try {
      await fetch(`/api/jobs/${jobId}/control`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, chapter: chapter.id }),
      });
    } catch (e) {}
  };

  const statusConfig: Record<ChapterStatus, { icon: React.ReactNode; color: string; bg: string }> = {
    waiting: { icon: <span className="text-xs">·</span>, color: "text-muted-foreground", bg: "bg-muted/50" },
    writing: { icon: <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-500/5 border-blue-500/20" },
    done: { icon: <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>, color: "text-green-600 dark:text-green-400", bg: "bg-green-500/5 border-green-500/20" },
    failed: { icon: <span className="text-xs font-bold">✗</span>, color: "text-red-600 dark:text-red-400", bg: "bg-red-500/5 border-red-500/20" },
  };
  const cfg = statusConfig[chapter.status];
  return (
    <div className={`rounded-lg border p-3 ${cfg.bg} transition-all relative group`}>
      <div className="flex items-center gap-2 mb-1.5 pr-8">
        <span className={cfg.color}>{cfg.icon}</span>
        <span className="text-xs font-semibold truncate" title={chapter.id}>{chapter.title}</span>
      </div>
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
        {chapter.wordCount > 0 && <span>{chapter.wordCount} 字</span>}
        {chapter.elapsedMs > 0 && <span>{(chapter.elapsedMs / 1000).toFixed(1)}s</span>}
        {chapter.errorClass && <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-red-500/10 text-red-500">{chapter.errorClass.replace("_", " ")}{chapter.errorAttempt ? ` (${chapter.errorAttempt}/${chapter.errorMaxAttempts})` : ""}</span>}{chapter.error && !chapter.errorClass && <span className="text-red-500 truncate" title={chapter.error}>{chapter.error}</span>}
      </div>
      {status === "running" && (chapter.status === "waiting" || chapter.status === "writing") && (
        <button onClick={() => sendCommand("skip")} className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 px-2 py-0.5 text-[10px] font-medium bg-background border border-border rounded hover:bg-muted transition-all">Skip</button>
      )}
    </div>
  );
}

function EvalSection({ scores }: { scores: EvalScores }) {
  const bars = [{ label: "Content", value: scores.content, max: 40, color: "bg-blue-500" }, { label: "Visual", value: scores.visual, max: 35, color: "bg-purple-500" }, { label: "Interaction", value: scores.interaction, max: 25, color: "bg-amber-500" }];
  return (<div><h2 className="text-xs font-bold uppercase tracking-wider mb-4 text-muted-foreground">Evaluation</h2><div className="rounded-lg border border-border bg-card p-5"><div className="text-center mb-6"><div className="text-4xl font-bold tabular-nums">{scores.score}</div><div className="text-xs text-muted-foreground mt-1">Overall Score</div></div><div className="space-y-3">{bars.map((b) => (<div key={b.label}><div className="flex justify-between text-xs mb-1"><span className="font-medium">{b.label}</span><span className="text-muted-foreground tabular-nums">{b.value}/{b.max}</span></div><div className="h-1.5 rounded-full bg-muted overflow-hidden"><div className={`h-full rounded-full ${b.color} transition-all duration-700`} style={{ width: `${(b.value / b.max) * 100}%` }} /></div></div>))}</div></div></div>);
}

function TerminalLogViewer({ logs }: { logs: Array<Record<string, unknown>> }) {
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs.length]);

  if (logs.length === 0) return null;

  return (
    <div className="mt-8 rounded-lg border border-border bg-[#0a0a0a] overflow-hidden flex flex-col">
      <div className="bg-[#1a1a1a] px-4 py-2 border-b border-[#2a2a2a] flex items-center gap-2">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500/80"></div>
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/80"></div>
          <div className="w-2.5 h-2.5 rounded-full bg-green-500/80"></div>
        </div>
        <span className="text-[10px] text-muted-foreground font-mono ml-2 uppercase tracking-wider">Harness Output</span>
      </div>
      <div 
        ref={containerRef}
        className="p-4 h-64 overflow-y-auto font-mono text-[11px] leading-relaxed text-gray-300"
      >
        {logs.map((l, i) => {
          if (!l.msg && l.type) return null;
          let msg = (l.msg as string) || "";
          // Strip ANSI color codes
          msg = msg.replace(/\x1b\[[0-9;]*m/g, "");
          msg = msg.replace(/\x1b\[[0-9;]*m/g, "");
          if (msg.includes("{")) {
            try {
              const p = JSON.parse(msg);
              if (p.msg) msg = p.msg;
            } catch {}
          }
          const isErr = l.level === "ERROR";
          const isOk = l.level === "OK";
          const isHead = l.level === "HEAD";
          
          return (
            <div key={i} className="mb-1 flex gap-3 hover:bg-white/5 px-1 -mx-1 rounded">
              <span className="text-gray-500 shrink-0 w-16">{l.ts as string}</span>
              <span className={`shrink-0 w-12 font-bold ${
                isErr ? "text-red-400" : 
                isOk ? "text-green-400" : 
                isHead ? "text-blue-400" : 
                "text-purple-400"
              }`}>
                {l.level as string}
              </span>
              <span className={`break-all ${isErr ? "text-red-300" : isHead ? "text-blue-300 font-bold" : "text-gray-300"}`}>
                {msg}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
function PlanCard({ state }: { state: DashboardState }) {
  if (!state.plan || state.activePhaseIndex < 0) return null;
  const { summary, chapters, improve_webapp, improve_focus } = state.plan;
  
  return (
    <div className="mb-8 p-5 rounded-xl border border-blue-500/20 bg-blue-500/5 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
        <h3 className="font-semibold text-blue-900 dark:text-blue-300">AI Action Plan</h3>
      </div>
      
      <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
        {summary || "No specific summary provided. Reverting to sequential fallback plan."}
      </p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Chapters to Write</h4>
          <ul className="space-y-2">
            {(chapters || []).map((ch: any, i: number) => (
              <li key={i} className="flex gap-2 text-sm bg-background/50 rounded-lg p-2.5 border">
                <span className="text-blue-500 font-bold shrink-0">→</span>
                <div>
                  <div className="font-medium">{ch.id}</div>
                  {ch.focus && <div className="text-xs text-muted-foreground mt-0.5">{ch.focus}</div>}
                </div>
              </li>
            ))}
          </ul>
        </div>
        
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Web App Target</h4>
          <div className="flex gap-2 text-sm bg-background/50 rounded-lg p-2.5 border">
            <span className={improve_webapp ? "text-amber-500 font-bold" : "text-green-500 font-bold"}>
              {improve_webapp ? "⚠" : "✓"}
            </span>
            <div>
              <div className="font-medium">{improve_webapp ? "Needs Improvement" : "No Action Needed"}</div>
              {improve_focus && <div className="text-xs text-muted-foreground mt-0.5">{improve_focus}</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
