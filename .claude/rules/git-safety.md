---
alwaysApply: true
description: Git 操作白名单，禁止破坏性命令
---

# Git 安全规则

## 禁止的 git 操作

以下 git 命令在任何情况下都**不得执行**：

- `git push`（含 `--force`）
- `git reset`（含 `--hard` / `--soft`）
- `git rebase`
- `git checkout -f` / `git checkout --force`
- `git clean -f`
- `git branch -D`

## 允许的 git 操作

### 只读（随时可用）

- `git status`
- `git log`
- `git diff`

### 写操作（仅限 harness 仓库）

- `git add` — 暂存变更
- `git commit` — 提交变更（需有明确的提交意图）

> 注意：对目标源码仓库（`repo_path`），**一切 git 写操作均禁止**，仅允许只读命令。

## 适用范围

此规则同时适用于 harness 仓库和目标源码仓库。
