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
from pyharness.errors import ErrorLedger
from pyharness.eval import eval_content, eval_visual, eval_interaction, merge_scores
from pyharness.log import log, log_event
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
        quick_mode: bool = False,
        control_file: Optional[Path] = None,
    ) -> None:
        self.config = config
        self.max_hours = max_hours
        self.threshold = threshold
        self.max_parallel = max_parallel
        self.resume = resume
        self.max_iterations = max_iterations
        self.log_sink = log_sink
        self.quick_mode = quick_mode
        self.control_file = control_file

        self._paused = False
        self._cancelled = False
        self._skip_chapters: set[str] = set()
        self._rewrite_queue: list[str] = []

        self.harness_dir = Path.cwd()
        self.knowledge_dir = self.harness_dir / "knowledge" / config.name
        self.chapters_dir = self.knowledge_dir / "chapters"
        self.log_dir = self.harness_dir / "output" / "logs"
        self.webapp_dir = self.harness_dir / "web-app"
        self.lock_file = self.harness_dir / ".harness.lock"

        self.state = StateManager(self.harness_dir / "state.json")
        self.error_ledger: ErrorLedger | None = None
        self.start_time: float = 0


    def _check_commands(self) -> None:
        if not self.control_file:
            return
        from pyharness.commands import read_commands
        for cmd in read_commands(self.control_file):
            action = cmd.get("action")
            if action == "pause":
                self._paused = True
                log("INFO", "\u23f8 Generation paused by user")
            elif action == "resume":
                self._paused = False
                log("INFO", "\u25b6 Generation resumed")
            elif action == "cancel":
                self._cancelled = True
                log("INFO", "\u23f9 Generation cancelled by user")
            elif action == "skip":
                self._skip_chapters.add(cmd.get("chapter", ""))
                log("INFO", f"\u23ed Skipping chapter: {cmd.get('chapter')}")
            elif action == "rewrite":
                self._rewrite_queue.append(cmd.get("chapter", ""))
                log("INFO", f"\U0001f504 Queued rewrite: {cmd.get('chapter')}")
            elif action == "set-parallelism":
                val = max(1, min(10, int(cmd.get("value", self.max_parallel))))
                log("INFO", f"Parallelism: {self.max_parallel} \u2192 {val}")
                self.max_parallel = val

    async def _wait_if_paused(self) -> None:
        while self._paused and not self._cancelled:
            await asyncio.sleep(1)
            self._check_commands()

    async def run(self) -> None:
        self._acquire_lock()
        self.chapters_dir.mkdir(parents=True, exist_ok=True)
        self.log_dir.mkdir(parents=True, exist_ok=True)

        from pyharness.log import init_log
        init_log(self.log_dir, sink_path=self.log_sink)

        self.error_ledger = ErrorLedger(self.log_dir / "errors.jsonl")

        if self.resume and self.state.path.exists():
            s = self.state.load()
            log("INFO", f"Resuming from iteration {s.iteration} (score: {s.score})")
        else:
            self.state.init()
            log("INFO", "Fresh start")

        self.start_time = time.time()
        last_eval_feedback = ""

        if self.quick_mode:
            log("INFO", "Quick mode: skipping phases 3, 4, 6")

        while True:
            self._check_commands()
            await self._wait_if_paused()
            if self._cancelled:
                log("HEAD", "Generation cancelled")
                break

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
            log_event("iteration_start", {"iteration": iteration, "max_iterations": self.max_iterations, "score": s.score, "elapsed_h": round(elapsed_h, 2)})
            if self.error_ledger:
                self.error_ledger.reset_iteration()

            # Phase 1: Plan
            log("STEP", "Phase 1/7: Planning...")
            log_event("phase_change", {"iteration": iteration, "phase": "plan", "phase_index": 1, "phase_total": 7})
            from pyharness.phases.plan import step_plan
            plan = await step_plan(self, iteration, last_eval_feedback)

            self._check_commands()
            if self._cancelled:
                log("HEAD", "Generation cancelled")
                break

            # Phase 2: Write chapters
            log("STEP", "Phase 2/7: Writing Chapters...")
            log_event("phase_change", {"iteration": iteration, "phase": "write", "phase_index": 2, "phase_total": 7})
            from pyharness.phases.write import step_write_chapters
            await step_write_chapters(
                self, iteration, plan,
                skip_chapters=self._skip_chapters,
                rewrite_queue=self._rewrite_queue,
            )
            self._rewrite_queue = []

            # Persist failed chapters from this iteration to state
            if self.error_ledger:
                from pyharness.schemas import FailedChapter
                unresolved = self.error_ledger.get_unresolved(iteration)
                if unresolved:
                    failed = [
                        FailedChapter(
                            chapter_id=e["chapter_id"],
                            error_class=e["error_class"],
                            error_message=e["error_message"][:200],
                            iteration=iteration,
                            attempts=e["attempt"],
                        )
                        for e in unresolved
                    ]
                    s_now = self.state.load()
                    existing_ids = {fc.chapter_id for fc in s_now.failed_chapters}
                    for fc in failed:
                        if fc.chapter_id in existing_ids:
                            s_now.failed_chapters = [
                                fc if x.chapter_id == fc.chapter_id else x
                                for x in s_now.failed_chapters
                            ]
                        else:
                            s_now.failed_chapters.append(fc)
                    self.state._write(s_now)
                    log("WARN", f"{len(unresolved)} chapter(s) failed all retry attempts this iteration")

            self._check_commands()
            if self._cancelled:
                log("HEAD", "Generation cancelled")
                break

            # Phase 3: Improve webapp
            if self.quick_mode:
                log("INFO", "Phase 3/7: Skipped (quick mode)")
            elif plan and plan.needs_webapp_improve:
                log("STEP", "Phase 3/7: Improving Web App...")
                log_event("phase_change", {"iteration": iteration, "phase": "improve", "phase_index": 3, "phase_total": 7})
                from pyharness.phases.improve import step_improve_webapp
                try:
                    await step_improve_webapp(self, iteration, last_eval_feedback)
                except Exception as e:
                    log("WARN", f"Webapp improve failed: {e}")
            else:
                log("INFO", "Phase 3/7: Skipping webapp improve")

            self._check_commands()
            if self._cancelled:
                log("HEAD", "Generation cancelled")
                break

            # Phase 4: Code review
            if self.quick_mode:
                log("INFO", "Phase 4/7: Skipped (quick mode)")
            else:
                log("STEP", "Phase 4/7: Code Review...")
                log_event("phase_change", {"iteration": iteration, "phase": "review", "phase_index": 4, "phase_total": 7})
                from pyharness.phases.review import step_code_review
                try:
                    await step_code_review(self, iteration)
                except Exception as e:
                    log("WARN", f"Code review failed: {e}")

            self._check_commands()
            if self._cancelled:
                log("HEAD", "Generation cancelled")
                break

            # Phase 5: Build site
            log("STEP", "Phase 5/7: Building Site...")
            log_event("phase_change", {"iteration": iteration, "phase": "build", "phase_index": 5, "phase_total": 7})
            from pyharness.phases.build import step_build_site
            try:
                await step_build_site(self)
            except Exception as e:
                log("WARN", f"Site build failed: {e}")

            self._check_commands()
            if self._cancelled:
                log("HEAD", "Generation cancelled")
                break

            # Phase 6: Visual test
            if self.quick_mode:
                log("INFO", "Phase 6/7: Skipped (quick mode)")
            else:
                log("STEP", "Phase 6/7: Visual Testing...")
                log_event("phase_change", {"iteration": iteration, "phase": "visual_test", "phase_index": 6, "phase_total": 7})
                from pyharness.phases.visual_test import step_visual_test
                try:
                    await step_visual_test(self)
                except Exception as e:
                    log("WARN", f"Visual test failed: {e}")

            self._check_commands()
            if self._cancelled:
                log("HEAD", "Generation cancelled")
                break

            # Phase 7: Evaluate
            log("STEP", "Phase 7/7: Deterministic Evaluation...")
            log_event("phase_change", {"iteration": iteration, "phase": "evaluate", "phase_index": 7, "phase_total": 7})
            try:
                content_eval = eval_content(self.chapters_dir, self.config.total_chapters)
                visual_eval = eval_visual(self.webapp_dir, self.harness_dir / "output" / "screenshots" / "report.json")
                interaction_eval = eval_interaction(self.harness_dir / "output" / "screenshots" / "report.json")
                merged = merge_scores(content_eval, visual_eval, interaction_eval)

                new_score = merged.score
                last_eval_feedback = merged.format_feedback()

                self.state.update_after_eval(iteration, merged)
                log("OK", f"Score: {new_score}/100 (content:{merged.scores.content}/40 visual:{merged.scores.visual}/35 interaction:{merged.scores.interaction}/25)")
                log_event("eval_result", {"iteration": iteration, "score": new_score, "content": merged.scores.content, "visual": merged.scores.visual, "interaction": merged.scores.interaction})

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
