## Why

当前 pyharness 有 55 个单元测试覆盖 eval/schemas/config/state/diagnostics，但 **Claude CLI 调用链路完全没有自动化测试**。`claude_client.py` 的传参拼装、JSON 解析鲁棒性、以及 `runner.py` 的 phase 状态机转换都依赖手动端到端验证。这意味着：

1. 改 `claude_client.py` 的 argv 拼装逻辑（如加 `--bare`）没有回归保护
2. Claude CLI 返回格式变化（新增字段、markdown 包裹变体）会导致静默解析失败
3. `runner.py` 的循环控制（跳过 write、条件执行 improve、停止条件）修改后无法验证不跑飞

这三类问题都不需要真实 Claude 调用——用 mock subprocess 即可在毫秒级完成验证。

## What Changes

- 新增 `tests/test_claude_client.py`：mock `asyncio.create_subprocess_exec`，验证 CLI 参数拼装、JSON 输出解析（包括畸形输入）、response_model 验证、超时处理
- 新增 `tests/test_runner.py`：mock 所有 phase 函数，验证 runner 的阶段顺序、条件跳过、停止条件、lock 文件管理
- 新增 `tests/fixtures/`：录制的 Claude CLI 响应 JSON（plan/chapter 各一个），供 mock 返回

## Capabilities

### New Capabilities
- `cli-contract-tests`: 测试 claude_client.py 的 argv 拼装、JSON 解析、response_model 验证
- `runner-state-machine-tests`: 测试 runner.py 的 phase 转换、循环控制、错误处理
- `recorded-fixtures`: 录制真实 CLI 响应作为测试 fixture

### Modified Capabilities

## Impact

- **文件系统**：新增 3 个测试文件 + fixtures 目录
- **CI**：`pytest tests/` 从 55 个测试增加到约 75 个，仍在 1 秒内完成
- **不影响**：生产代码不改动
