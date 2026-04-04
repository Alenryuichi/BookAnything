"""Phase 5: Build the Next.js static site + git checkpoint."""

from __future__ import annotations

import asyncio
import shutil
from typing import TYPE_CHECKING

from pyharness.log import log

if TYPE_CHECKING:
    from pyharness.runner import HarnessRunner


async def step_build_site(runner: HarnessRunner) -> None:
    """Run next build to generate static output."""
    webapp = runner.webapp_dir

    if not (webapp / "node_modules").is_dir():
        log("INFO", "Installing web-app dependencies...")
        proc = await asyncio.create_subprocess_exec(
            "npm", "install", "--silent",
            cwd=str(webapp),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        await proc.communicate()
        if proc.returncode != 0:
            raise RuntimeError("npm install failed")

    next_dir = webapp / ".next"
    if next_dir.exists():
        shutil.rmtree(next_dir)

    env = {"KNOWLEDGE_PROJECT": runner.config.name, "PATH": "/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin"}
    import os
    env["PATH"] = os.environ.get("PATH", env["PATH"])
    env["HOME"] = os.environ.get("HOME", "")

    proc = await asyncio.create_subprocess_exec(
        "npx", "next", "build",
        cwd=str(webapp),
        env=env,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(f"next build failed: {stderr.decode()[-500:]}")

    out_dir = webapp / "out"
    if out_dir.exists():
        size = sum(f.stat().st_size for f in out_dir.rglob("*") if f.is_file())
        log("OK", f"Site built ({size // 1024 // 1024}M)")
    else:
        raise RuntimeError("next build produced no output")


async def step_checkpoint(runner: HarnessRunner, iteration: int, score: int) -> None:
    """Git commit knowledge and state changes."""
    proc = await asyncio.create_subprocess_exec(
        "git", "add", "knowledge/", "state.json",
        cwd=str(runner.harness_dir),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    await proc.communicate()

    msg = f"checkpoint: [{runner.config.name}] iter #{iteration} | score {score}/100"

    proc = await asyncio.create_subprocess_exec(
        "git", "commit", "-q", "-m", msg,
        cwd=str(runner.harness_dir),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    await proc.communicate()

    if proc.returncode == 0:
        log("OK", f"Checkpoint: {msg}")
    else:
        log("INFO", "Checkpoint: no changes to commit")
