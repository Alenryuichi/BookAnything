"""Tests for pyharness.repo — resolve_repo_path."""

import os
import subprocess
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest

from pyharness.repo import resolve_repo_path, RepoNotFoundError


@pytest.fixture
def tmp_base(tmp_path):
    return tmp_path


class TestAbsolutePath:
    def test_existing_absolute_path(self, tmp_base):
        repo = tmp_base / "my-repo"
        repo.mkdir()
        result = resolve_repo_path(str(repo))
        assert result == repo

    def test_missing_absolute_no_remote(self, tmp_base):
        repo = tmp_base / "nonexistent"
        with pytest.raises(RepoNotFoundError, match="Repository not found"):
            resolve_repo_path(str(repo))


class TestRelativePath:
    def test_relative_resolves_against_base_dir(self, tmp_base):
        repo = tmp_base / "repos" / "my-repo"
        repo.mkdir(parents=True)
        result = resolve_repo_path("repos/my-repo", base_dir=tmp_base)
        assert result == repo

    def test_relative_resolves_against_cwd(self, tmp_base):
        repo = tmp_base / "local-repo"
        repo.mkdir()
        old_cwd = os.getcwd()
        try:
            os.chdir(tmp_base)
            result = resolve_repo_path("local-repo")
            assert result == repo
        finally:
            os.chdir(old_cwd)


class TestAutoClone:
    @patch("pyharness.repo.subprocess.run")
    def test_missing_with_remote_triggers_clone(self, mock_run, tmp_base):
        target = tmp_base / "repos" / "cloned"

        def side_effect(*args, **kwargs):
            target.mkdir(parents=True, exist_ok=True)
            return MagicMock(returncode=0)

        mock_run.side_effect = side_effect

        result = resolve_repo_path(str(target), remote_url="https://github.com/example/repo.git")
        assert result == target
        mock_run.assert_called_once()
        call_args = mock_run.call_args
        assert call_args[0][0] == ["git", "clone", "https://github.com/example/repo.git", str(target)]

    @patch("pyharness.repo.subprocess.run")
    def test_clone_failure_raises(self, mock_run, tmp_base):
        target = tmp_base / "fail-repo"
        mock_run.side_effect = subprocess.CalledProcessError(
            128, "git", stderr="fatal: repo not found"
        )
        with pytest.raises(RepoNotFoundError, match="Auto re-clone failed"):
            resolve_repo_path(str(target), remote_url="https://example.com/bad.git")

    @patch("pyharness.repo.subprocess.run")
    def test_clone_timeout_raises(self, mock_run, tmp_base):
        target = tmp_base / "timeout-repo"
        mock_run.side_effect = subprocess.TimeoutExpired("git", 300)
        with pytest.raises(RepoNotFoundError, match="timed out"):
            resolve_repo_path(str(target), remote_url="https://example.com/slow.git")


class TestMissingNoRemote:
    def test_error_mentions_no_remote_url(self, tmp_base):
        target = tmp_base / "gone"
        with pytest.raises(RepoNotFoundError, match="no remote_url configured"):
            resolve_repo_path(str(target))
