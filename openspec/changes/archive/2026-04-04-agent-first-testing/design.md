## Context

pyharness 通过 `claude_client.py` 的 `asyncio.create_subprocess_exec("claude", "-p", ...)` 调用 Claude Code CLI。当前 55 个测试全部绕过了这个边界——eval/schemas/config/state 的测试用 fixture 数据，不触碰 subprocess。

测试金字塔的缺口在"集成层"：CLI 传参是否正确、返回值解析是否鲁棒、runner 循环控制是否可靠。

## Goals / Non-Goals

**Goals:**
- 用 mock subprocess 测试 CLI 参数拼装和 JSON 解析，无需真实 Claude 调用
- 用 mock phase 函数测试 runner 状态机，验证阶段顺序和停止条件
- 录制少量真实 CLI 响应作为 fixture，确保 parser 能处理真实格式
- 所有新测试在 1 秒内完成，可在每次 commit 前跑

**Non-Goals:**
- 不测试 Claude 模型的回答质量（那是 eval 系统的职责）
- 不做 LLM-as-judge 测试（太慢、非确定性）
- 不做 SWE-bench 风格的端到端评估

## Decisions

### D1: Mock 边界在 subprocess 层

**选择**: Mock `asyncio.create_subprocess_exec`，让 `ClaudeClient.run()` 认为 CLI 被成功调用，但实际返回预制的 stdout/stderr/returncode。

**理由**: 这是最小 mock 粒度——测试了 argv 拼装、stdout 解析、错误处理的全链路，只跳过了"真正调 Claude"这一步。比 mock `ClaudeClient.run()` 本身更有价值，因为后者会跳过 JSON 解析逻辑。

### D2: Fixture 文件来自一次真实录制

**选择**: 手动跑一次 `claude -p` 拿到真实 JSON 输出，存为 `tests/fixtures/cli_plan_response.json` 和 `cli_chapter_response.json`。

**理由**: 确保测试的 fixture 格式和真实 CLI 输出一致，不是手写的理想化 JSON。录一次即可长期复用。

### D3: Runner 测试 mock 所有 phase 函数

**选择**: 用 `unittest.mock.patch` 替换 `step_plan`、`step_write_chapters`、`step_improve_webapp` 等，让它们立即返回预制结果。

**理由**: Runner 的核心逻辑是"按顺序调 phase、检查停止条件、更新 state"。每个 phase 的内部实现已有独立测试覆盖。Runner 测试只关心编排逻辑。

### D4: `_extract_json` 用 property-style 测试覆盖边界

**选择**: 对 `_extract_json()` 用大量变体输入测试：纯 JSON、markdown 包裹（```json ... ```）、前后有 prose、嵌套 JSON、空输入、非 JSON。

**理由**: 这个函数是 LLM 输出到结构化数据的唯一桥梁，任何格式变体都不能崩。

## Risks / Trade-offs

**[Mock 和真实行为漂移]** → 定期（如每月）重新录制 fixture。如果 Claude CLI 输出格式变了，fixture 测试会最先发现。

**[Runner 测试可能过度 mock]** → 只测关键路径：正常循环、跳过 write、达到阈值停止、时间超限停止。不 mock 每种组合。
