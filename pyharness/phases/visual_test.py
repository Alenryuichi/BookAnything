"""Phase 6: Visual testing via Playwright screenshots."""

from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING

from pyharness.log import log

if TYPE_CHECKING:
    from pyharness.runner import HarnessRunner


async def step_visual_test(runner: HarnessRunner) -> None:
    """Run Playwright visual test script."""
    out_dir = runner.webapp_dir / "out"
    if not out_dir.is_dir():
        log("WARN", "No build output, skipping visual test")
        return

    screenshot_dir = runner.harness_dir / "output" / "screenshots"
    screenshot_dir.mkdir(parents=True, exist_ok=True)

    script = runner.harness_dir / "scripts" / "visual-test.js"

    import os
    env = dict(os.environ)
    env["NODE_PATH"] = str(runner.webapp_dir / "node_modules")

    proc = await asyncio.create_subprocess_exec(
        "node", str(script), str(out_dir), str(screenshot_dir),
        env=env,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()

    if proc.returncode == 0:
        log("OK", "Visual test passed")
    else:
        log("WARN", "Visual test found issues")
