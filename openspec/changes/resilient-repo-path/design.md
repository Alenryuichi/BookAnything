## Context

当前 `repo_path` 在项目 YAML 中是硬编码绝对路径，由 `pyharness init` 写入。整个系统中有 4 个主要消费者：

1. `pyharness/runner.py` — `HarnessRunner.__init__` 读取 `config.repo_path` 作为工作目录
2. `pyharness/phases/analyze.py` — `step_analyze` 读取 `runner.config.repo_path` 定位源码
3. `pyharness/__main__.py` — `init` 子命令计算 `repo_path` 并写入 YAML
4. `web-app/app/api/books/route.ts` — `POST` 创建书时构造 `targetRepoPath` 并传给 init

YAML 格式示例（当前）：
```yaml
name: "autoresearch"
repo_path: "/Users/kylinmiao/.cursor/worktrees/harness/skm/workspaces/autoresearch"
```

缺失场景：远程 clone 失败、目录被删、跨机器同步、worktree 路径不同。

## Goals / Non-Goals

**Goals:**
- `repo_path` 缺失时，系统能自动恢复（auto re-clone）或给出明确修复指引
- 新创建的项目 YAML 使用相对路径 + `remote_url`，便于跨环境移植
- 旧的绝对路径 YAML 仍然兼容
- 前端能在 repo 不可用时给出清晰 UI 提示

**Non-Goals:**
- 不做仓库版本/分支管理（git ref pinning）
- 不支持多仓库合并书籍
- 不做自动 git pull 更新（仅 clone 恢复）

## Decisions

### 1. YAML 格式扩展

新增可选字段 `remote_url`，`repo_path` 改为相对路径（相对于 harness root）：

```yaml
name: "autoresearch"
repo_path: "workspaces/autoresearch"          # 相对路径
remote_url: "https://github.com/karpathy/autoresearch"  # 新增
```

**兼容性**：以 `/` 开头的路径视为绝对路径，直接使用。否则拼接 harness root。

**Why**: 相对路径让 YAML 在不同机器上都能工作；`remote_url` 让系统能自动恢复。

**Alternative**: 只存 `remote_url` 让系统每次按需计算路径 — 过于隐式，本地仓库无 remote 时不适用。

### 2. 统一解析函数 `resolve_repo_path`

放在 `pyharness/repo.py`（新文件），签名：

```python
def resolve_repo_path(
    repo_path: str,
    remote_url: str | None = None,
    base_dir: str | Path | None = None,
) -> Path:
```

逻辑：
1. 如果 `repo_path` 是绝对路径且存在 → 直接返回
2. 如果是相对路径 → 拼接 `base_dir`（默认 harness root）
3. 拼接后存在 → 返回
4. 不存在且有 `remote_url` → `git clone remote_url target_dir` → 返回
5. 不存在且无 `remote_url` → raise `RepoNotFoundError`

**Why**: 集中一处解决，所有消费者调用同一函数，逻辑不分散。

### 3. 前端 repo 健康检查 API

新增 `GET /api/books/{bookId}/repo-status`，返回：

```json
{ "available": true, "path": "workspaces/autoresearch", "remote_url": "https://..." }
// 或
{ "available": false, "path": "workspaces/autoresearch", "remote_url": "https://...", "canReclone": true }
// 或
{ "available": false, "path": "/abs/path/gone", "remote_url": null, "canReclone": false }
```

前端在 analyze/generate 之前可先检查，repo 不可用时显示：
- 有 `remote_url` → "仓库不存在，点击重新 clone"
- 无 `remote_url` → "仓库路径不存在，请检查配置"

**Why**: 让前端在操作前就能感知问题，而不是等后台报错后才展示。

### 4. `pyharness init` 改写逻辑

当前 init 直接写入 `Path(repo).resolve()` 作为绝对路径。改为：
- 检查 repo 是否在 harness root 下 → 是则写相对路径
- 否则写绝对路径
- 如果调用时提供了 `--remote-url` 参数 → 额外写入 `remote_url` 字段

**Why**: 渐进式迁移，已有的绝对路径不受影响。

## Risks / Trade-offs

**[Risk] git clone 在 CI 环境或受限网络中失败** → `resolve_repo_path` clone 失败时抛出明确异常，前端显示完整错误信息 + 手动修复指引。

**[Risk] 相对路径在不同 cwd 下解析不一致** → `base_dir` 参数显式传入，不依赖 `os.getcwd()`。Runner 构造时传入 harness root。

**[Trade-off] 不做 git pull** → 仅在目录完全缺失时 clone，不自动更新。避免意外覆盖用户本地修改。用户如需更新可手动 pull。
