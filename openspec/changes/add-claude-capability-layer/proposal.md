## Why

当前 harness 通过 `run.sh` 驱动 `claude -p` headless 循环生成技术书章节。所有阶段逻辑（plan/write/evaluate/improve）以 bash heredoc 形式内联在 `run.sh` 中，写作约束和 JSON 契约全部依赖 `CLAUDE.md` 单个文件。这导致：

1. 阶段能力无法复用——每次迭代都将完整提示重新拼装，无法在交互会话中单独调试某个阶段
2. 缺乏运行时护栏——没有 hooks 保护路径安全和 JSON 产物质量，坏 JSON 要到 bash 层才能发现
3. 约束与规范混杂——`CLAUDE.md` 同时承载叙事风格指南和机器可执行的硬规则，难以按职责维护
Claude Code 官方已支持 repo-local `.claude` 目录（settings/rules/skills/agents/hooks），在 `claude -p` 非 `--bare` 模式下自动加载。现在是引入这套能力层的合适时机。

## What Changes

- 新增 `.claude/settings.json`，注册 hooks 和项目默认配置
- 新增 `.claude/rules/`（5 个文件），承载机器可执行的硬约束（git 安全、JSON 契约、路径边界、目录布局、术语表）
- 精简 `CLAUDE.md`，改为总纲索引，硬约束指向 `.claude/rules/`
- 新增 `.claude/skills/`（4 个 SKILL.md），将 plan/write/evaluate/webapp-review 阶段模块化为自动激活能力
- 新增 `.claude/agents/`（4 个 agent），为 planner/writer/evaluator/webapp-reviewer 角色定义工具边界
- 新增 `.claude/commands/`（3 个 command），提供仅限交互会话的调试入口
- 新增 `.claude/hooks/`（4 个脚本），实现路径拦截、JSON 校验、compact 后上下文恢复、子代理日志
- 新增 `.claude/README.md`，面向维护者的能力层说明文档

## Capabilities

### New Capabilities
- `settings-and-rules`: 项目 settings.json 基座 + 5 条可执行规则，建立单一真源策略
- `skill-modules`: 4 个自动激活 skills，将阶段流程从 heredoc 提取为可复用能力包
- `agent-roles`: 4 个角色隔离的 subagent，定义工具白名单和输出契约
- `hooks-guardrails`: 4 类运行时 hooks（PreToolUse/PostToolUse/SessionStart/SubagentLog），保护产物质量和路径安全
- `interactive-debug-commands`: 仅限交互会话的 slash commands，用于调试和手动验证

### Modified Capabilities
- `claude-md-contract`: 现有 `CLAUDE.md` 需精简为总纲索引，硬约束迁移至 `.claude/rules/`

## Impact

- **文件系统**：新增 `.claude/` 目录树（约 20 个文件），修改 `CLAUDE.md`
- **Headless 路径**：`.claude` 中的 settings/hooks/rules/skills 会在 `claude -p` 调用时自动加载，影响所有 `run.sh` 驱动的阶段任务
- **交互会话**：新增 commands 和 agents 可在人工 Claude 会话中使用
- **不影响**：`run.sh` 编排逻辑本身不改动；`projects/*.yaml`、`goals.yaml`、`web-app/` 不改动
- **风险**：如果将来 `run.sh` 改为 `--bare` 模式，`.claude` 全部能力会被跳过，需同步调整
