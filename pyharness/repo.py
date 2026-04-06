"""Unified repository path resolution with auto re-clone support."""

from __future__ import annotations

import subprocess
from pathlib import Path


class RepoNotFoundError(Exception):
    """Raised when a repository path cannot be resolved."""
    pass


def resolve_repo_path(
    repo_path: str,
    remote_url: str | None = None,
    base_dir: str | Path | None = None,
) -> Path:
    """Resolve a repo_path from project YAML to an existing directory.

    Resolution order:
    1. Absolute path (starts with /) → use as-is
    2. Relative path → join with base_dir (defaults to cwd)
    3. If resolved path exists → return it
    4. If missing + remote_url → git clone, then return
    5. If missing + no remote_url → raise RepoNotFoundError
    """
    p = Path(repo_path)

    if p.is_absolute():
        resolved = p
    else:
        base = Path(base_dir) if base_dir else Path.cwd()
        resolved = (base / p).resolve()

    if resolved.is_dir():
        return resolved

    if remote_url:
        resolved.parent.mkdir(parents=True, exist_ok=True)
        try:
            subprocess.run(
                ["git", "clone", remote_url, str(resolved)],
                check=True,
                capture_output=True,
                text=True,
                timeout=300,
            )
        except subprocess.CalledProcessError as exc:
            raise RepoNotFoundError(
                f"Auto re-clone failed for {remote_url}: {exc.stderr.strip()}"
            ) from exc
        except subprocess.TimeoutExpired:
            raise RepoNotFoundError(
                f"Auto re-clone timed out for {remote_url}"
            )

        if resolved.is_dir():
            return resolved

        raise RepoNotFoundError(
            f"Clone completed but directory not found: {resolved}"
        )

    raise RepoNotFoundError(
        f"Repository not found: {resolved}"
        + (" (no remote_url configured for auto re-clone)" if not remote_url else "")
    )
