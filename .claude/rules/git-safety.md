# Git 安全规则

## 禁止的 git 操作

以下 git 命令在任何情况下都**不得执行**：

- `git push`
- `git reset`
- `git rebase`
- `git checkout -f` / `git checkout --force`
- `git clean -f`
- `git branch -D`

## 允许的 git 操作（只读）

- `git status`
- `git log`
- `git diff`

## 适用范围

此规则同时适用于 harness 仓库和目标源码仓库。不得在源码仓库中执行任何 git 写操作。
