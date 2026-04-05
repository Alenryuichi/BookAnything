## Why

当前 84 个测试全部是传统软件工程测试——验证"代码路径是否正确"（eval 公式、JSON 解析、argv 拼装、state 读写）。但 harness 本质是一个 **Agent 系统**：它计划、执行、评估、迭代。传统测试回答不了 Agent 系统的核心问题：

1. **Prompt 改了之后，生成质量会不会降？** —— 没有 prompt 回归检测
2. **Eval 公式调整后，反馈信号还准不准？** —— 没有已知好/坏样本的校准测试
3. **诊断信号闭环是否有效？** —— eval 产出组件级 issues，improve 收到后是否构建了正确的修复 prompt？修改后哪些分数应该提升？
4. **整个系统改了之后，还能收敛吗？** —— 没有跑一轮真实 Claude 调用的端到端回归

这些是 Agent 工程（Harness Engineering）的测试——关注的是 **Agent 的行为和结果**，不是代码分支覆盖。

## What Changes

建立 5 层 Agent-First 测试体系，与现有 84 个代码级测试互补：

- **Golden Run 录制/回放**：录制一次完整的成功运行（每个 phase 的 Claude 响应 + 产物），存为 fixture；后续代码变更后回放，验证同样的 Claude 响应经过新代码管道后产出相同分数
- **Prompt 快照回归**：对 plan/write/evaluate/improve 4 个阶段的 prompt 模板做 snapshot；prompt 变了必须 review，防止无意退化
- **Eval 校准测试**：收集已知好章节（高分）和已知坏章节（低分），验证 eval 公式给出预期分数范围；当调整公式时确保校准不漂移
- **信号环完整性**：给定一个特定的 report.json（含 diagnostics），验证 eval 产出的 issues 能精确传导到 improve 的 prompt 中（组件路径、诊断文本、fix_hint 一致）
- **真实 E2E 收敛测试**：用真实 Claude CLI 跑 1 轮完整循环，验证 state.json 更新、章节写入、分数计算全链路可工作

## Capabilities

### New Capabilities
- `golden-run-replay`: 录制/回放测试框架，验证相同 Claude 响应经过代码变更后产出相同结果
- `prompt-snapshot-regression`: Prompt 模板快照，检测无意的 prompt 变化
- `eval-calibration`: 用已知好/坏样本校准 eval 公式
- `signal-loop-integrity`: 验证 eval → improve 的诊断信号传导完整性
- `e2e-convergence`: 真实 Claude CLI 端到端测试

### Modified Capabilities

## Impact

- **文件系统**：新增 `tests/agent/` 子目录 + fixture 文件
- **CI**：快速测试（snapshot + calibration + signal loop）< 1s；E2E 测试需要真实 Claude 调用，标记为 slow/optional
- **开发流程**：每次改 prompt 或 eval 公式后，`pytest tests/agent/` 会立刻发现回归
