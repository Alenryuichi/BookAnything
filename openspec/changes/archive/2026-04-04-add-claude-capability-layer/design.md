## Context

当前 harness 仓库的 Claude Code 交互完全依赖两条路径：
1. **Headless 路径**：`run.sh` 通过 `$CLAUDE_CMD -p "..."` 驱动，cwd 为 `harness/`，未使用 `--bare`，因此 CLI 会自动加载项目 `.claude/` 目录
2. **交互路径**：开发者在 `harness/` 目录下启动 Claude 交互会话进行调试

所有阶段逻辑以 bash heredoc 内联在 `run.sh` 中（约 1100 行），`CLAUDE.md` 同时承载叙事风格指南和机器约束。`prompts/*.md` 是早期提示模板，已部分被 heredoc 取代但仍保留。

## Goals / Non-Goals

**Goals:**
- 建立 `.claude/` 目录，使 settings/rules/skills/agents/hooks 在 headless 和交互两条路径下都生效
- 将阶段能力从 heredoc 中提取为可独立引用的 skills
- 用 hooks 在运行时保护 JSON 产物质量和路径安全
- 建立 `CLAUDE.md` 与 `.claude/rules/` 的单一真源关系
**Non-Goals:**
- 不改动 `run.sh` 编排逻辑（循环、并行、状态机）
- 不引入 `--bare` + `--settings` 显式绑定模式（留作后续演进）
- 不替代 `run.sh` 中的 heredoc 提示拼装——skills 作为"额外能力"存在，heredoc 继续作为主提示源
- 不在 `.claude` 内重建变更管理流程——harness 演进由 OpenSpec（`openspec/`）负责，不属于 `.claude` 能力层

## Decisions

### D1: `.claude/` 放在 `harness/` 根下

**选择**: `.claude/` 位于 `harness/`（即 `run.sh` 所在目录）

**理由**: `claude -p` 的 cwd 就是 `harness/`，CLI 按 cwd 向上查找 `.claude/`，放在这里确保两条路径都能命中。

**替代方案**: 放在上层 `claude-code/` 根——会让 `.claude` 覆盖范围过大，影响其他子目录。

### D2: `CLAUDE.md` 保留为总纲，rules/ 承载硬约束

**选择**: `CLAUDE.md` 精简为叙事风格指南 + 指向 `.claude/rules/` 的索引；rules/ 只放机器可执行的硬约束（git 安全、JSON schema、路径白名单）

**理由**: 避免两处重复维护。`CLAUDE.md` 对模型是"指导性上下文"，rules 是"强制策略"；两者语义不同，不应混在一个文件里。

**替代方案**: 全部留在 `CLAUDE.md`——维护方便但无法把约束分发给 hooks 脚本引用；全部迁到 rules——失去 `CLAUDE.md` 作为人类可读总纲的价值。

### D3: Skills 作为阶段能力包，不替代 heredoc

**选择**: skills 定义"plan/write-chapter/evaluate/webapp-review"四个自动激活能力，但 `run.sh` 的 heredoc 继续作为主提示源

**理由**: `run.sh` 的 heredoc 中包含大量动态变量（iteration、chapter_id、source paths、上轮评估反馈），这些在 SKILL.md 的静态 frontmatter 中无法表达。Skills 的价值是当模型在 headless 或交互会话中需要"理解如何执行某个阶段"时，提供稳定的参考约定。

**替代方案**: 把 heredoc 完全替换为 skill 调用——需要大幅改造 `run.sh`，超出本次范围。

### D4: Commands 仅限交互调试，不进 headless 路径

**选择**: 只建 2 个 commands（status、verify-json），明确标注"仅限交互会话"

**理由**: 官方文档明确 slash commands 在 `-p` 模式下不可触发。把阶段逻辑放 commands 是无效设计。

### D5: Hooks 只做轻量拦截和校验，不做自动修复

**选择**: PreToolUse 拦截路径和危险 bash；PostToolUse 做 JSON 解析校验（block + reason 反馈）；SessionStart 在 compact 后注入约束；SubagentStart/Stop 记日志

**理由**: 长时间 headless 运行中，复杂 hooks 一旦出错会导致难以排障的静默失败。先做最简单的"拦截 + 校验 + 日志"，验证生效后再迭代。

**替代方案**: PostToolUse 自动 revert 坏文件——PostToolUse 实际上无法撤销已发生的写入（官方限制），只能给反馈。

### D6: Hooks 注册方式

**选择**: 通过 `.claude/settings.json` 的 `hooks` 字段注册，hook 脚本放 `.claude/hooks/`

**理由**: 这是官方标准方式。hooks 在 settings.json 中声明事件类型、匹配器和脚本路径，CLI 启动时读取并注册。

## Risks / Trade-offs

**[`--bare` 未来兼容]** → 在 `.claude/README.md` 中显著标注 headless 加载依赖；如果 `run.sh` 改为 `--bare`，需同步改为 `--settings` 绑定

**[Skills 与 heredoc 重复]** → Skills 定义"稳定约定"，heredoc 负责"动态拼装"；两者职责不同但内容有交集。缓解：skills 中明确标注"以 heredoc 运行时变量为准"

**[Hook 超时影响 headless]** → PreToolUse/PostToolUse 默认超时 10 分钟，但 JSON 校验应在毫秒级完成。SessionStart 的 compact 注入也应很快。如果出现超时，CLI 会跳过 hook 继续执行（非致命）

**[PostToolUse 无法撤销写入]** → 坏 JSON 写入后 PostToolUse 只能给反馈让模型重试，不能自动回滚。缓解：`run.sh` 已有 JSON 清洗逻辑作为第二道防线

**[规则分叉]** → 通过"CLAUDE.md = 索引，rules/ = 实体"策略缓解。每次修改只改 rules/，CLAUDE.md 只改索引指针

**[变更管理在 OpenSpec 而非 .claude]** → harness 演进通过 `openspec/` 目录管理，`.claude` 不重复此职责
