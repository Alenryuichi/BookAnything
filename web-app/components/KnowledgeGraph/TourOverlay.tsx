"use client";

import { useState } from "react";
import type { GuidedTour } from "./types";

interface Props {
  tours: GuidedTour[];
  onStepChange: (nodeId: string) => void;
  onExit: () => void;
}

export function TourOverlay({ tours, onStepChange, onExit }: Props) {
  const [tourIdx, setTourIdx] = useState(0);
  const [stepIdx, setStepIdx] = useState(0);
  const [selecting, setSelecting] = useState(true);

  if (selecting) {
    return (
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40 bg-background/95 backdrop-blur-md border border-border rounded-xl shadow-2xl p-4 w-96">
        <h3 className="text-sm font-bold mb-3">🧭 Select a Tour</h3>
        <div className="space-y-2">
          {tours.map((t, i) => (
            <button
              key={t.id}
              onClick={() => {
                setTourIdx(i);
                setStepIdx(0);
                setSelecting(false);
                if (t.steps[0]) onStepChange(t.steps[0].node_id);
              }}
              className="w-full text-left px-3 py-2 rounded-lg border border-border hover:bg-muted transition-colors"
            >
              <div className="text-xs font-semibold">{t.name}</div>
              <div className="text-[10px] text-muted-foreground">{t.description} · {t.steps.length} steps</div>
            </button>
          ))}
        </div>
        <button onClick={onExit} className="mt-3 text-xs text-muted-foreground hover:text-foreground transition-colors">
          Cancel
        </button>
      </div>
    );
  }

  const tour = tours[tourIdx];
  const step = tour.steps[stepIdx];

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40 bg-background/95 backdrop-blur-md border border-border rounded-xl shadow-2xl p-4 w-[480px]">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-bold">🧭 {tour.name}</h3>
        <span className="text-[10px] text-muted-foreground">Step {stepIdx + 1} of {tour.steps.length}</span>
      </div>

      {/* Progress */}
      <div className="h-1 bg-muted rounded-full mb-3 overflow-hidden">
        <div
          className="h-full bg-blue-500 rounded-full transition-all duration-300"
          style={{ width: `${((stepIdx + 1) / tour.steps.length) * 100}%` }}
        />
      </div>

      <p className="text-xs leading-relaxed mb-3">{step.narrative}</p>

      <div className="flex items-center gap-2">
        <button
          onClick={() => {
            if (stepIdx > 0) {
              setStepIdx(stepIdx - 1);
              onStepChange(tour.steps[stepIdx - 1].node_id);
            }
          }}
          disabled={stepIdx === 0}
          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-border hover:bg-muted transition-colors disabled:opacity-30"
        >
          ← Previous
        </button>
        <button
          onClick={() => {
            if (stepIdx < tour.steps.length - 1) {
              setStepIdx(stepIdx + 1);
              onStepChange(tour.steps[stepIdx + 1].node_id);
            }
          }}
          disabled={stepIdx === tour.steps.length - 1}
          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors disabled:opacity-30"
        >
          Next →
        </button>
        <button onClick={onExit} className="ml-auto px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
          ✕ Exit
        </button>
      </div>
    </div>
  );
}
