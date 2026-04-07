"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type AnalyzeStage =
  | "scanning"
  | "analyzing"
  | "merging"
  | "tours"
  | "finalizing";

export type StageStatus = "pending" | "active" | "complete";

export interface StageInfo {
  id: AnalyzeStage;
  label: string;
  status: StageStatus;
  detail?: string;
}

export interface LogEntry {
  ts?: string;
  level?: string;
  msg?: string;
  event?: string;
  data?: Record<string, unknown>;
  progress?: number;
}

export interface AnalyzeProgressState {
  stages: StageInfo[];
  overallProgress: number;
  currentStage: AnalyzeStage | null;
  batchTotal: number;
  batchComplete: number;
  filesFound: number;
  filesSkipped: number;
  done: boolean;
  error: string | null;
  rawLogs: LogEntry[];
}

const STAGE_WEIGHTS: Record<AnalyzeStage, number> = {
  scanning: 0.1,
  analyzing: 0.6,
  merging: 0.15,
  tours: 0.1,
  finalizing: 0.05,
};

const STAGE_ORDER: AnalyzeStage[] = [
  "scanning",
  "analyzing",
  "merging",
  "tours",
  "finalizing",
];

function makeInitialStages(): StageInfo[] {
  return [
    { id: "scanning", label: "Scanning files", status: "pending" },
    { id: "analyzing", label: "Analyzing code", status: "pending" },
    { id: "merging", label: "Merging results", status: "pending" },
    { id: "tours", label: "Generating tours", status: "pending" },
    { id: "finalizing", label: "Finalizing", status: "pending" },
  ];
}

function computeProgress(
  stages: StageInfo[],
  currentStage: AnalyzeStage | null,
  batchComplete: number,
  batchTotal: number,
): number {
  let progress = 0;
  for (const stage of STAGE_ORDER) {
    const info = stages.find((s) => s.id === stage);
    if (!info) continue;
    const weight = STAGE_WEIGHTS[stage];

    if (info.status === "complete") {
      progress += weight;
    } else if (info.status === "active" && stage === currentStage) {
      if (stage === "analyzing" && batchTotal > 0) {
        progress += weight * (batchComplete / batchTotal);
      } else {
        progress += weight * 0.5;
      }
    }
  }
  return Math.min(Math.round(progress * 100), 100);
}

const MAX_LOGS = 200;

export function useAnalyzeProgress(jobId: string | null) {
  const [state, setState] = useState<AnalyzeProgressState>({
    stages: makeInitialStages(),
    overallProgress: 0,
    currentStage: null,
    batchTotal: 0,
    batchComplete: 0,
    filesFound: 0,
    filesSkipped: 0,
    done: false,
    error: null,
    rawLogs: [],
  });

  const esRef = useRef<EventSource | null>(null);
  const retriesRef = useRef(0);
  const sawAnalyzeCompleteRef = useRef(false);
  const MAX_RETRIES = 3;

  const activateStage = useCallback(
    (stage: AnalyzeStage) => {
      setState((prev) => {
        const idx = STAGE_ORDER.indexOf(stage);
        const stages = prev.stages.map((s) => {
          const sIdx = STAGE_ORDER.indexOf(s.id);
          if (sIdx < idx) return { ...s, status: "complete" as StageStatus };
          if (sIdx === idx) return { ...s, status: "active" as StageStatus };
          return s;
        });
        const overallProgress = computeProgress(
          stages,
          stage,
          prev.batchComplete,
          prev.batchTotal,
        );
        return { ...prev, stages, currentStage: stage, overallProgress };
      });
    },
    [],
  );

  const completeStage = useCallback(
    (stage: AnalyzeStage, detail?: string) => {
      setState((prev) => {
        const stages = prev.stages.map((s) =>
          s.id === stage
            ? { ...s, status: "complete" as StageStatus, detail: detail ?? s.detail }
            : s,
        );
        const nextIdx = STAGE_ORDER.indexOf(stage) + 1;
        const nextStage =
          nextIdx < STAGE_ORDER.length ? STAGE_ORDER[nextIdx] : null;
        if (nextStage) {
          const ns = stages.find((s) => s.id === nextStage);
          if (ns && ns.status === "pending") {
            ns.status = "active";
          }
        }
        const overallProgress = computeProgress(
          stages,
          nextStage,
          prev.batchComplete,
          prev.batchTotal,
        );
        return {
          ...prev,
          stages,
          currentStage: nextStage,
          overallProgress,
        };
      });
    },
    [],
  );

  const appendLog = useCallback((entry: LogEntry) => {
    setState((prev) => ({
      ...prev,
      rawLogs: [...prev.rawLogs, entry].slice(-MAX_LOGS),
    }));
  }, []);

  useEffect(() => {
    if (!jobId) return;

    sawAnalyzeCompleteRef.current = false;
    setState({
      stages: makeInitialStages(),
      overallProgress: 0,
      currentStage: null,
      batchTotal: 0,
      batchComplete: 0,
      filesFound: 0,
      filesSkipped: 0,
      done: false,
      error: null,
      rawLogs: [],
    });

    const connect = () => {
      const es = new EventSource(`/api/jobs/${jobId}/stream`);
      esRef.current = es;

      es.addEventListener("log", (e) => {
        retriesRef.current = 0;
        try {
          const entry = JSON.parse(e.data) as LogEntry;

          appendLog(entry);

          const evt = entry.event as string | undefined;
          if (!evt) return;

          if (evt === "analyze_start") {
            activateStage("scanning");
          } else if (evt === "analyze_scan_complete") {
            const found = (entry.data?.files_found as number) ?? 0;
            const skipped = (entry.data?.files_skipped as number) ?? 0;
            setState((prev) => ({ ...prev, filesFound: found, filesSkipped: skipped }));
            completeStage("scanning", `${found} files found, ${skipped} skipped`);
          } else if (evt === "analyze_batches_created") {
            const total = (entry.data?.total_batches as number) ?? 1;
            setState((prev) => ({ ...prev, batchTotal: total, batchComplete: 0 }));
            activateStage("analyzing");
          } else if (evt === "analyze_batch_complete") {
            setState((prev) => {
              const bc = prev.batchComplete + 1;
              const stages = prev.stages.map((s) =>
                s.id === "analyzing"
                  ? { ...s, detail: `Batch ${bc} / ${prev.batchTotal}` }
                  : s,
              );
              const overallProgress = computeProgress(
                stages,
                "analyzing",
                bc,
                prev.batchTotal,
              );
              return { ...prev, batchComplete: bc, stages, overallProgress };
            });
          } else if (evt === "analyze_merge_complete") {
            completeStage("analyzing");
            completeStage("merging");
          } else if (evt === "analyze_tours_complete") {
            completeStage("tours");
            activateStage("finalizing");
          } else if (evt === "analyze_complete") {
            sawAnalyzeCompleteRef.current = true;
            setState((prev) => ({
              ...prev,
              stages: prev.stages.map((s) => ({
                ...s,
                status: "complete" as StageStatus,
              })),
              overallProgress: 100,
              done: true,
              currentStage: null,
            }));
            es.close();
          }
        } catch {
          // ignore malformed events
        }
      });

      es.addEventListener("done", () => {
        if (sawAnalyzeCompleteRef.current) {
          setState((prev) => ({
            ...prev,
            stages: prev.stages.map((s) => ({
              ...s,
              status: "complete" as StageStatus,
            })),
            overallProgress: 100,
            done: true,
            currentStage: null,
          }));
        } else {
          setState((prev) => {
            const lastErrorLog = [...prev.rawLogs]
              .reverse()
              .find((l) => l.level === "ERROR" || (l.msg && /error|not found|fail/i.test(l.msg)));
            let msg = lastErrorLog?.msg || "Analysis finished without producing a knowledge graph";
            msg = msg.replace(/\x1b\[[0-9;]*m/g, "");
            return { ...prev, error: msg };
          });
        }
        es.close();
      });

      es.addEventListener("error", (e) => {
        const data = (e as MessageEvent).data;
        let msg = "Analysis failed";
        try {
          const parsed = JSON.parse(data);
          msg = parsed.error || parsed.state || msg;
        } catch {}
        setState((prev) => ({ ...prev, error: msg }));
        es.close();
      });

      es.onerror = () => {
        if (es.readyState === EventSource.CLOSED) return;
        es.close();
        retriesRef.current += 1;
        if (retriesRef.current <= MAX_RETRIES) {
          setTimeout(connect, 2000 * retriesRef.current);
        } else {
          setState((prev) => ({
            ...prev,
            error: "Connection lost. Please refresh the page.",
          }));
        }
      };
    };

    connect();

    return () => {
      esRef.current?.close();
      esRef.current = null;
    };
  }, [jobId, activateStage, completeStage, appendLog]);

  return state;
}
