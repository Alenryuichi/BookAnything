## Why

项目 YAML 中的 `repo_path` 是硬编码绝对路径，且系统各处（`analyze`、`run`、`init`、前端 API）直接使用它而不做存在性检查。当远程仓库 clone 失败、工作目录被删除、或在不同机器/worktree 间同步时，`repo_path` 指向的目录不存在，导致 pyharness 报错 "Repository path not found" 而用户没有明确的修复路径。

## What Changes

- **YAML 新增 `remote_url` 字段**：`POST /api/books` 创建书时，如果来源是远程 URL，额外写入 `remote_url` 到项目 YAML 中，保留仓库来源信息
- **`repo_path` 改为相对路径**：项目 YAML 中的 `repo_path` 改为相对于 harness root 的路径（如 `workspaces/autoresearch`），而非绝对路径
- **统一 repo 解析函数**：pyharness 新增 `resolve_repo_path(config)` 函数，所有需要 repo 的地方统一调用，逻辑为：(1) 相对路径转绝对 (2) 存在则直接返回 (3) 不存在但有 `remote_url` 则自动 clone (4) 否则报错
- **前端仓库状态感知**：`/explore` 和书详情页在检测到 repo 缺失时，显示明确的错误信息和 "Re-clone" 修复按钮，而非等后台报错
- **兼容旧 YAML**：绝对路径仍然可用，`resolve_repo_path` 先检测是否为绝对路径，是则直接用；否则拼接 harness root

## Capabilities

### New Capabilities
- `repo-resolve`: 统一仓库路径解析（相对路径转绝对、自动 re-clone、缺失检测）
- `repo-health-check`: 前端 API 检查仓库状态，为 UI 提供 "仓库是否可用" 信息

### Modified Capabilities

## Impact

- `pyharness/config.py` 或新建 `pyharness/repo.py` — 新增 `resolve_repo_path()` 函数
- `pyharness/runner.py` — 调用 `resolve_repo_path()` 替代直接读 `config.repo_path`
- `pyharness/phases/analyze.py` — 同上
- `pyharness/__main__.py` init 子命令 — 写入 YAML 时使用相对路径 + `remote_url`
- `web-app/app/api/books/route.ts` — POST 创建书时传递 `remote_url` 到 init 命令
- `web-app/app/api/books/[bookId]/analyze/route.ts` — 调用 analyze 前可检查 repo 状态
- `web-app/components/KnowledgeGraph/KnowledgeGraphPage.tsx` — 展示 repo 缺失的 UI
- 无新依赖
