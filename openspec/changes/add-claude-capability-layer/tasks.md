## 1. Settings + Rules 基座

- [x] 1.1 创建 `.claude/settings.json`，注册 PreToolUse、PostToolUse、SessionStart、SubagentStart、SubagentStop hooks，声明 hook 脚本路径
- [x] 1.2 创建 `.claude/rules/git-safety.md`，禁止 git push/reset/rebase/checkout -f/branch -D，只允许 git status/log/diff
- [x] 1.3 创建 `.claude/rules/chapter-json-contract.md`，定义纯 JSON 输出、必需字段（chapter_id, title, sections, key_takeaways, word_count）、字数范围 3000-5000
- [x] 1.4 创建 `.claude/rules/path-boundaries.md`，限制写入路径为 knowledge/、web-app/、output/、openspec/
- [x] 1.5 创建 `.claude/rules/repo-layout.md`，描述 projects/、prompts/、knowledge/、output/、web-app/、scripts/ 各目录职责
- [x] 1.6 创建 `.claude/rules/workflow-glossary.md`，定义 iteration、chapter、score、threshold、phase 等术语和 7 阶段流程
- [x] 1.7 精简 `CLAUDE.md`：保留写作风格指南，将 git 规则、JSON 格式、路径限制替换为指向 `.claude/rules/` 的索引引用

## 2. Skills 模块化

- [x] 2.1 创建 `.claude/skills/harness-plan/SKILL.md`，定义计划阶段的输入（state/goals/chapters）、输出（plan JSON）、工具限制（Read/Glob/Grep）
- [x] 2.2 创建 `.claude/skills/harness-write-chapter/SKILL.md`，定义写作阶段的输入（chapter_id/sources/outline）、输出（chapter JSON）、写作方法论（70%/30%、开篇引子、比喻、mermaid）
- [x] 2.3 创建 `.claude/skills/harness-evaluate/SKILL.md`，定义评估阶段的三维评分（content/40, visual/35, interaction/25）、输入（摘要/截图报告）、输出（eval JSON）
- [x] 2.4 创建 `.claude/skills/harness-webapp-review/SKILL.md`，定义 webapp 改进的输入（评估反馈/截图）、输出（修复 JSON）、路径限制（仅 web-app/）

## 3. Agents 角色隔离

- [x] 3.1 创建 `.claude/agents/planner.md`，工具限制为 Read/Glob/Grep，输出 plan JSON
- [x] 3.2 创建 `.claude/agents/chapter-writer.md`，工具限制为 Read/Glob/Grep，输出 chapter JSON
- [x] 3.3 创建 `.claude/agents/evaluator.md`，工具限制为 Read/Glob/Grep，输出 eval JSON
- [x] 3.4 创建 `.claude/agents/webapp-reviewer.md`，工具限制为 Read/Glob/Grep/Write/Edit，仅改 web-app/

## 4. Commands 交互调试

- [x] 4.1 创建 `.claude/commands/harness-status.md`，显示 state.json、最近日志、lock 状态、章节数
- [x] 4.2 创建 `.claude/commands/harness-verify-json.md`，接受文件路径参数，校验 JSON 解析和必需字段
- [x] 4.3 迁移 openspec skills 到 commands（openspec-propose/apply/archive/explore 从 skills/ 移到 commands/）

## 5. Hooks 安全护栏

- [x] 5.1 创建 `.claude/hooks/pre-tool-use.sh`，实现路径白名单检查和危险 git 命令拦截，返回 deny JSON
- [x] 5.2 创建 `.claude/hooks/post-edit-json-validate.sh`，对 knowledge/**/*.json 做 jq 解析和必需字段检查，返回 block JSON
- [x] 5.3 创建 `.claude/hooks/session-start-context.sh`，在 compact 后输出 additionalContext JSON（约束摘要，<10000 字符）
- [x] 5.4 创建 `.claude/hooks/subagent-logger.sh`，在 SubagentStart/Stop 时追加日志到 output/logs/subagent-activity.log

## 6. 文档与验证

- [x] 6.1 创建 `.claude/README.md`，说明目录职责、headless 生效范围、commands 仅限交互、CLAUDE.md 与 rules 关系、新项目复用方式
- [x] 6.2 端到端验证：headless hooks 验证通过（基础调用 OK、git push 拦截 OK、路径边界拦截 OK）
- [ ] 6.3 端到端验证：在交互会话中确认 `/harness-status` 和 `/harness-verify-json` 可用（需人工执行）
