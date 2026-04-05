"""HarnessRunner — main orchestration loop."""

from __future__ import annotations

import asyncio
import atexit
import os
import signal
import time
from pathlib import Path
from typing import Optional

from pyharness.config import ProjectConfig
from pyharness.eval import eval_content, eval_visual, eval_interaction, merge_scores
from pyharness.log import log
from pyharness.state import StateManager


class HarnessRunner:
    def __init__(
        self,
        config: ProjectConfig,
        max_hours: float = 12,
        threshold: int = 85,
        max_parallel: int = 3,
        resume: bool = False,
        max_iterations: int = 0,
        log_sink: Optional[Path] = None,
    ) -> None:
        self.config = config
        self.max_hours = max_hours
        self.threshold = threshold
        self.max_parallel = max_parallel
        self.resume = resume
        self.max_iterations = max_iterations
        self.log_sink = log_sink

        self.harness_dir = Path.cwd()
        self.knowledge_dir = self.harness_dir / "knowledge" / config.name
        self.chapters_dir = self.knowledge_dir / "chapters"
        self.log_dir = self.harness_dir / "output" / "logs"
        self.webapp_dir = self.harness_dir / "web-app"
        self.lock_file = self.harness_dir / ".harness.lock"

        self.state = StateManager(self.harness_dir / "state.json")
        self.start_time: float = 0

    async def run(self) -> None:
        self._acquire_lock()
        self.chapters_dir.mkdir(parents=True, exist_ok=True)
        self.log_dir.mkdir(parents=True, exist_ok=True)

        from pyharness.log import init_log
        init_log(self.log_dir, sink_path=self.log_sink)

        if self.resume and self.state.path.exists():
            s = self.state.load()
            log("INFO", f"Resuming from iteration {s.iteration} (score: {s.score})")
        else:
            self.state.init()
            log("INFO", "Fresh start")

        self.start_time = time.time()
        last_eval_feedback = ""

        while True:
            elapsed_h = (time.time() - self.start_time) / 3600
            if elapsed_h > self.max_hours:
                log("HEAD", f"Time limit reached ({self.max_hours}h). Finalizing...")
                break

            s = self.state.load()
            iteration = s.iteration + 1

            if self.max_iterations > 0 and iteration > self.max_iterations:
                log("HEAD", f"Iteration limit reached ({self.max_iterations}). Finalizing...")
                break

            log("HEAD", f"Iteration #{iteration} | Score: {s.score}/100 | Time: {elapsed_h:.2f}h / {self.max_hours}h")

            # Phase 1: Plan
            log("STEP", "Phase 1/7: Planning...")
            from pyharness.phases.plan import step_plan
            plan = await step_plan(self, iteration, last_eval_feedback)

            # Phase 2: Write chapters
            log("STEP", "Phase 2/7: Writing Chapters...")
            from pyharness.phases.write import step_write_chapters
            await step_write_chapters(self, iteration, plan)

            # Phase 3: Improve webapp
            if plan and plan.needs_webapp_improve:
                log("STEP", "Phase 3/7: Improving Web App...")
                from pyharness.phases.improve import step_improve_webapp
                try:
                    await step_improve_webapp(self, iteration, last_eval_feedback)
                except Exception as e:
                    log("WARN", f"Webapp improve failed: {e}")
            else:
                log("INFO", "Phase 3/7: Skipping webapp improve")

            # Phase 4: Code review
            log("STEP", "Phase 4/7: Code Review...")
            from pyharness.phases.review import step_code_review
            try:
                await step_code_review(self, iteration)
            except Exception as e:
                log("WARN", f"Code review failed: {e}")

            # Phase 5: Build site
            log("STEP", "Phase 5/7: Building Site...")
            from pyharness.phases.build import step_build_site
            try:
                await step_build_site(self)
            except Exception as e:
                log("WARN", f"Site build failed: {e}")

            # Phase 6: Visual test
            log("STEP", "Phase 6/7: Visual Testing...")
            from pyharness.phases.visual_test import step_visual_test
            try:
                await step_visual_test(self)
            except Exception as e:
                log("WARN", f"Visual test failed: {e}")

            # Phase 7: Evaluate
            log("STEP", "Phase 7/7: Deterministic Evaluation...")
            try:
                content_eval = eval_content(self.chapters_dir, self.config.total_chapters)
                visual_eval = eval_visual(self.webapp_dir, self.harness_dir / "output" / "screenshots" / "report.json")
                interaction_eval = eval_interaction(self.harness_dir / "output" / "screenshots" / "report.json")
                merged = merge_scores(content_eval, visual_eval, interaction_eval)

                new_score = merged.score
                last_eval_feedback = merged.format_feedback()

                self.state.update_after_eval(iteration, merged)
                log("OK", f"Score: {new_score}/100 (content:{merged.scores.content}/40 visual:{merged.scores.visual}/35 interaction:{merged.scores.interaction}/25)")

                if new_score >= self.threshold:
                    log("HEAD", f"Target reached! Score {new_score} >= {self.threshold}")
                    break
            except Exception as e:
                log("ERROR", f"Evaluation failed: {e}")
                self.state.update_phase(iteration, "eval_failed")

            # Checkpoint
            from pyharness.phases.build import step_checkpoint
            try:
                await step_checkpoint(self, iteration, new_score)
            except Exception:
                pass

            log("INFO", "Cooling down 10s...")
            await asyncio.sleep(10)

        # Final build
        log("HEAD", "Final build...")
        from pyharness.phases.build import step_build_site
        try:
            await step_build_site(self)
        except Exception:
            pass

        s = self.state.load()
        log("OK", f"Harness Complete! Project: {self.config.name} | Score: {s.score}/100 | Iterations: {s.iteration}")

    def _acquire_lock(self) -> None:
        if self.lock_file.exists():
            pid = int(self.lock_file.read_text().strip())
            try:
                os.kill(pid, 0)
                raise RuntimeError(f"Harness already running (PID {pid})")
            except OSError:
                self.lock_file.unlink()

        self.lock_file.write_text(str(os.getpid()))
        atexit.register(self._release_lock)
        signal.signal(signal.SIGTERM, lambda *_: self._release_lock())
        signal.signal(signal.SIGINT, lambda *_: self._release_lock())

    def _release_lock(self) -> None:
        try:
            self.lock_file.unlink(missing_ok=True)
        except Exception:
            pass
