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
interface ChapterState { id: string; title: string; status: ChapterStatus; wordCount: number; elapsedMs: number; error?: string; }
interface EvalScores { score: number; content: number; visual: number; interaction: number; }
interface DashboardState { iteration: number; maxIterations: number; score: number; elapsedH: number; activePhaseIndex: number; completedPhases: Set<number>; chapters: Map<string, ChapterState>; eval: EvalScores | null; status: "connecting" | "running" | "done" | "error"; rawLogs: Array<Record<string, unknown>>; }

type Action =
  | { type: "iteration_start"; payload: Record<string, unknown> }
  | { type: "phase_change"; payload: Record<string, unknown> }
  | { type: "chapter_status"; payload: Record<string, unknown> }
  | { type: "eval_result"; payload: Record<string, unknown> }
  | { type: "raw_log"; payload: Record<string, unknown> }
  | { type: "done" } | { type: "error" } | { type: "connected" };

function reducer(state: DashboardState, action: Action): DashboardState {
  switch (action.type) {
    case "connected": return { ...state, status: "running" };
    case "iteration_start": { const p = action.payload; return { ...state, iteration: (p.iteration as number) ?? state.iteration, maxIterations: (p.max_iterations as number) ?? state.maxIterations, score: (p.score as number) ?? state.score, elapsedH: (p.elapsed_h as number) ?? state.elapsedH, activePhaseIndex: 0, completedPhases: new Set() }; }
    case "phase_change": { const p = action.payload; const idx = ((p.phase_index as number) ?? 1) - 1; const completed = new Set(state.completedPhases); for (let i = 0; i < idx; i++) completed.add(i); return { ...state, activePhaseIndex: idx, completedPhases: completed }; }
    case "chapter_status": { const p = action.payload; const chId = p.chapter_id as string; if (!chId) return state; const chapters = new Map(state.chapters); const existing = chapters.get(chId) ?? { id: chId, title: chId, status: "waiting" as ChapterStatus, wordCount: 0, elapsedMs: 0 }; chapters.set(chId, { ...existing, status: (p.status as ChapterStatus) ?? existing.status, wordCount: (p.word_count as number) ?? existing.wordCount, elapsedMs: (p.elapsed_ms as number) ?? existing.elapsedMs, error: p.error as string | undefined }); return { ...state, chapters }; }
    case "eval_result": { const p = action.payload; const completed = new Set(state.completedPhases); for (let i = 0; i < 7; i++) completed.add(i); return { ...state, eval: { score: (p.score as number) ?? 0, content: (p.content as number) ?? 0, visual: (p.visual as number) ?? 0, interaction: (p.interaction as number) ?? 0 }, score: (p.score as number) ?? state.score, completedPhases: completed, activePhaseIndex: 7 }; }
    case "raw_log": return { ...state, rawLogs: [...state.rawLogs, action.payload].slice(-200) };
    case "done": return { ...state, status: "done" };
    case "error": return { ...state, status: "error" };
    default: return state;
  }
}

function processLogEntry(entry: Record<string, unknown>, dispatch: React.Dispatch<Action>) {
  const eventType = entry.type as string | undefined;
  if (eventType && ["iteration_start", "phase_change", "chapter_status", "eval_result"].includes(eventType)) {
    dispatch({ type: eventType as Action["type"], payload: entry });
  } else {
    dispatch({ type: "raw_log", payload: entry });
  }
}

export function GenerationDashboard({ jobId, bookId, chapters: initialChapters }: { jobId: string; bookId: string; chapters: { id: string; title: string }[] }) {
  const initState: DashboardState = { iteration: 0, maxIterations: 3, score: 0, elapsedH: 0, activePhaseIndex: -1, completedPhases: new Set(), chapters: new Map(initialChapters.map((c) => [c.id, { id: c.id, title: c.title, status: "waiting" as ChapterStatus, wordCount: 0, elapsedMs: 0 }])), eval: null, status: "connecting", rawLogs: [] };
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
      <IterationHeader state={state} />
      <PhaseTimeline state={state} />
      <ChapterGrid state={state} />
      {state.eval && <EvalSection scores={state.eval} />}
      {state.status === "done" && (<div className="rounded-lg border border-green-500/30 bg-green-500/5 p-6 text-center"><div className="text-lg font-bold text-green-600 dark:text-green-400 mb-2">Generation Complete</div><p className="text-sm text-muted-foreground mb-4">Final score: {state.score}/100</p><Link href={`/books/${bookId}`} className="inline-block px-5 py-2.5 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity">View Book \u2192</Link></div>)}
      {state.status === "error" && (<div className="rounded-lg border border-red-500/30 bg-red-500/5 p-6 text-center"><div className="text-lg font-bold text-red-600 dark:text-red-400 mb-2">Generation Failed</div><p className="text-sm text-muted-foreground mb-4">An error occurred during generation.</p><button onClick={() => window.location.reload()} className="px-5 py-2.5 rounded-lg border border-border bg-card text-sm font-medium hover:border-foreground transition-colors">Retry</button></div>)}
    </div>
  );
}

function IterationHeader({ state }: { state: DashboardState }) {
  return (<div className="flex items-baseline justify-between flex-wrap gap-4"><div><h1 className="text-2xl font-extrabold tracking-tight">Iteration {state.iteration || "\u2014"}{" "}<span className="text-muted-foreground font-normal text-lg">/ {state.maxIterations}</span></h1>{state.elapsedH > 0 && <p className="text-sm text-muted-foreground mt-1">Elapsed: {state.elapsedH.toFixed(2)}h</p>}</div><div className="text-right"><div className="text-3xl font-bold tabular-nums">{state.score}</div><div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">score / 100</div></div></div>);
}

function PhaseTimeline({ state }: { state: DashboardState }) {
  return (<div className="flex items-center gap-1 overflow-x-auto pb-2">{PHASES.map((phase, i) => {const isActive = i === state.activePhaseIndex; const isDone = state.completedPhases.has(i); return (<div key={phase.key} className="flex items-center"><div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${isActive ? "bg-foreground text-background" : isDone ? "bg-green-500/10 text-green-600 dark:text-green-400" : "bg-muted text-muted-foreground"}`}>{isDone ? (<svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>) : isActive ? (<svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>) : (<span className="w-3.5 h-3.5 flex items-center justify-center text-[10px]">{i + 1}</span>)}{phase.label}</div>{i < PHASES.length - 1 && <div className={`w-4 h-px mx-0.5 ${isDone ? "bg-green-500/40" : "bg-border"}`} />}</div>);})}</div>);
}

function ChapterGrid({ state }: { state: DashboardState }) {
  const chapters = [...state.chapters.values()];
  if (chapters.length === 0) return null;
  return (<div><h2 className="text-xs font-bold uppercase tracking-wider mb-4 text-muted-foreground">Chapters</h2><div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">{chapters.map((ch) => <ChapterCard key={ch.id} chapter={ch} />)}</div></div>);
}

function ChapterCard({ chapter }: { chapter: ChapterState }) {
  const statusConfig: Record<ChapterStatus, { icon: React.ReactNode; color: string; bg: string }> = {
    waiting: { icon: <span className="text-xs">\u00b7</span>, color: "text-muted-foreground", bg: "bg-muted/50" },
    writing: { icon: <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-500/5 border-blue-500/20" },
    done: { icon: <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>, color: "text-green-600 dark:text-green-400", bg: "bg-green-500/5 border-green-500/20" },
    failed: { icon: <span className="text-xs font-bold">\u2717</span>, color: "text-red-600 dark:text-red-400", bg: "bg-red-500/5 border-red-500/20" },
  };
  const cfg = statusConfig[chapter.status];
  return (<div className={`rounded-lg border p-3 ${cfg.bg} transition-all`}><div className="flex items-center gap-2 mb-1.5"><span className={cfg.color}>{cfg.icon}</span><span className="text-xs font-semibold truncate" title={chapter.id}>{chapter.title}</span></div><div className="flex items-center gap-3 text-[10px] text-muted-foreground">{chapter.wordCount > 0 && <span>{chapter.wordCount} \u5b57</span>}{chapter.elapsedMs > 0 && <span>{(chapter.elapsedMs / 1000).toFixed(1)}s</span>}{chapter.error && <span className="text-red-500 truncate" title={chapter.error}>{chapter.error}</span>}</div></div>);
}

function EvalSection({ scores }: { scores: EvalScores }) {
  const bars = [{ label: "Content", value: scores.content, max: 40, color: "bg-blue-500" }, { label: "Visual", value: scores.visual, max: 35, color: "bg-purple-500" }, { label: "Interaction", value: scores.interaction, max: 25, color: "bg-amber-500" }];
  return (<div><h2 className="text-xs font-bold uppercase tracking-wider mb-4 text-muted-foreground">Evaluation</h2><div className="rounded-lg border border-border bg-card p-5"><div className="text-center mb-6"><div className="text-4xl font-bold tabular-nums">{scores.score}</div><div className="text-xs text-muted-foreground mt-1">Overall Score</div></div><div className="space-y-3">{bars.map((b) => (<div key={b.label}><div className="flex justify-between text-xs mb-1"><span className="font-medium">{b.label}</span><span className="text-muted-foreground tabular-nums">{b.value}/{b.max}</span></div><div className="h-1.5 rounded-full bg-muted overflow-hidden"><div className={`h-full rounded-full ${b.color} transition-all duration-700`} style={{ width: `${(b.value / b.max) * 100}%` }} /></div></div>))}</div></div></div>);
}
