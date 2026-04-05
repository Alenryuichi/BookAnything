## Why

`new-project.sh` (450 行 bash) 是唯一未迁移到 Python 的核心脚本。它依赖 `jq`、`find`、`wc` 等外部工具拼接 YAML，脆弱且难以测试。主流程已全面 Python 化（`pyharness/`），保留一个 bash 脚本破坏了代码一致性，也无法复用 `pyharness` 的 config/schema/claude_client 基础设施。

## What Changes

- 新增 `python3 -m pyharness init <repo_path>` 子命令，替代 `bash new-project.sh <repo_path>`
- 新增 `pyharness/init.py` 模块，实现三阶段逻辑：扫描仓库 → Claude 规划章节 → 生成 `projects/*.yaml`
- 复用 `ClaudeClient` 调用 Claude，复用 `ProjectConfig` schema 做输出验证
- **BREAKING**: 删除 `new-project.sh`（用户改用 `python3 -m pyharness init`）

## Capabilities

### New Capabilities
- `project-init-cli`: `pyharness init` 子命令——参数解析、.env 加载、输出路径处理
- `repo-scanner`: 仓库扫描——自动推断项目名、语言、源码目录、文件/行数统计、目录树收集
- `chapter-planner`: Claude 章节规划——构建 prompt、调用 ClaudeClient、解析 JSON、fallback 骨架生成
- `yaml-generator`: YAML 生成——将 Claude 输出转换为带 Part 注释的 `projects/*.yaml`，符合 ProjectConfig schema

### Modified Capabilities
（无）

## Impact

- **CLI**: `__main__.py` 新增 `init` 子命令
- **依赖**: 无新依赖（`pathlib`/`subprocess` 替代 `find`/`wc`/`jq`）
- **删除**: `new-project.sh`
- **测试**: 需要新增 `tests/test_init.py`（扫描逻辑、YAML 生成、fallback 路径）
