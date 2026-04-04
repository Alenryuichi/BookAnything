"""State management with atomic writes."""

from __future__ import annotations

import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from pyharness.schemas import HarnessState, MergedEval, ScoreRecord, ScoresBreakdown


class StateManager:
    def __init__(self, path: Path) -> None:
        self.path = path

    def init(self) -> HarnessState:
        state = HarnessState()
        self._write(state)
        return state

    def load(self) -> HarnessState:
        if not self.path.exists():
            return self.init()
        raw = json.loads(self.path.read_text())
        return HarnessState(**raw)

    def _write(self, state: HarnessState) -> None:
        data = state.model_dump(mode="json")
        fd, tmp = tempfile.mkstemp(dir=self.path.parent, suffix=".tmp")
        try:
            with os.fdopen(fd, "w") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
                f.write("\n")
            os.replace(tmp, self.path)
        except Exception:
            try:
                os.unlink(tmp)
            except OSError:
                pass
            raise

    def update_after_eval(self, iteration: int, merged: MergedEval) -> None:
        state = self.load()
        state.iteration = iteration
        state.score = merged.score
        state.scores = merged.scores
        state.phase = "evaluated"
        state.history.append(ScoreRecord(
            iteration=iteration,
            total=merged.score,
            content=merged.scores.content,
            visual=merged.scores.visual,
            interaction=merged.scores.interaction,
            time=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        ))
        self._write(state)

    def update_phase(self, iteration: int, phase: str) -> None:
        state = self.load()
        state.iteration = iteration
        state.phase = phase
        self._write(state)
