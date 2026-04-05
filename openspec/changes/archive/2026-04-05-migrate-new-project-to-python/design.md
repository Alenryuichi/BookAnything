## Context

`new-project.sh` 是一个 450 行的 bash 脚本，负责：
1. 扫描目标仓库——推断项目名、语言、源码目录、文件/行数统计
2. 构建 prompt，调用 `claude -p` 分析源码并规划章节
3. 将 Claude 的 JSON 输出转换为 `projects/*.yaml`

当前 Python harness (`pyharness/`) 已有完整的 CLI 入口（`__main__.py`）、Claude 调用封装（`ClaudeClient`）和配置 schema（`ProjectConfig`/`ChapterConfig`）。bash 脚本未复用这些基础设施，而是用 `jq`/`find`/`wc` 重复实现。

## Goals / Non-Goals

**Goals:**
- 将 `new-project.sh` 三阶段逻辑 1:1 迁移到 `pyharness/init.py`
- 通过 `python3 -m pyharness init <repo_path>` 调用
- 复用 `ClaudeClient` 和 `ProjectConfig` schema
- 保留 Claude 调用失败时的 fallback 骨架生成能力
- 单元测试覆盖扫描逻辑和 YAML 生成（不测 Claude 调用）

**Non-Goals:**
- 不改变 `projects/*.yaml` 的输出格式（保持向后兼容）
- 不引入新的外部依赖
- 不修改 `run` 子命令的任何行为
- 不重构 `ClaudeClient` 或 `ProjectConfig`（只复用）

## Decisions

### D1: 模块结构 — 单文件 `pyharness/init.py`

**选择**: 所有逻辑集中在 `pyharness/init.py`，导出 `async def init_project(repo_path: Path) -> Path`

**备选**: 拆分为 `scanner.py` + `planner.py` + `generator.py`

**理由**: bash 脚本总共 ~300 行有效逻辑，Python 会更短。拆多文件过度设计。如果未来需要拆分（如 scanner 被其他功能复用），再重构也容易。

### D2: 仓库扫描 — 纯 Python 实现

**选择**: 用 `pathlib.Path.rglob()` + 内置 `collections.Counter` 替代 `find`/`wc`/`jq`

**备选**: 调用 `subprocess.run(["find", ...])` 保持与 bash 行为一致

**理由**: `pathlib` 跨平台、可测试、无外部依赖。`jq` 在某些系统上需要额外安装，而 Python 原生就能解析 `package.json`。

### D3: 语言检测 — 扩展名计数

**选择**: 维护一个 `EXTENSION_MAP: dict[str, str]`（`.ts/.tsx` → TypeScript, `.py` → Python, ...），用 `Counter` 统计最高频语言

与 bash 的 `detect_language()` 逻辑一致，但 Python 版可轻松扩展新语言。

### D4: Claude 调用 — 复用 `ClaudeClient`

**选择**: 直接调用 `ClaudeClient(cwd=repo_path).run(prompt, max_turns=30)`，传入与 bash 脚本相同的中文 prompt

**备选**: 自行拼 `subprocess.run(["claude", "-p", ...])`

**理由**: `ClaudeClient` 已处理 `.env`/`CLAUDE_CMD`、JSON 解析、错误恢复。不需要重新实现。

### D5: YAML 输出 — `yaml.dump` + 手工 Part 注释

**选择**: 先用 `yaml.dump()` 生成基础结构，然后在 `chapters:` 段中插入 Part 注释行（`# ─── Part N: xxx ───`）

**备选**: 完全手工拼 YAML 字符串（如 bash 版）

**理由**: `yaml.dump()` 保证语法正确。Part 注释需后处理注入，但比纯字符串拼接安全得多。

### D6: Fallback 骨架 — 按目录生成

与 bash 一致：当 Claude 返回的 JSON 无法解析或缺少 `parts` 字段时，按仓库顶层目录自动生成章节骨架，给用户一个可编辑的起点。

## Risks / Trade-offs

- **[R1] Claude prompt 差异** → 直接复制 bash 中的中文 prompt，保持输出一致性。逐步优化可在后续迭代中进行。
- **[R2] `pathlib.rglob` 性能** → 大型仓库（>100k 文件，如 Linux kernel）扫描可能较慢。→ Mitigation: 排除 `node_modules`/`.git`/`dist` 等目录，与 bash 版相同的排除策略。
- **[R3] YAML Part 注释注入复杂度** → `yaml.dump()` 不支持注释。→ Mitigation: 生成 YAML 后用字符串替换注入注释行，或直接用 f-string 模板拼接关键段落。
- **[R4] 删除 bash 脚本的 breaking change** → 用户可能有现有的自动化依赖 `bash new-project.sh`。→ Mitigation: 在 README/changelog 中注明迁移路径。
