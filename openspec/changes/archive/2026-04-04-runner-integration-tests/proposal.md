## Why

`runner.run()` 是 harness 的核心主循环——它编排 7 个 phase、检查停止条件、处理错误韧性。但它完全没有自动化测试。之前认为"lazy import + asyncio.sleep 导致 mock 复杂"是技术障碍，但调研确认了解法：patch 源模块路径 + AsyncMock sleep。这个盲区应该被消除。

## What Changes

- 新增 `tests/test_runner_integration.py`：用 patch 源模块 + AsyncMock 测试 `runner.run()` 的完整 async 主循环
- 验证：7 phase 按顺序执行、条件跳过 improve、分数达标停止、时间超限停止、phase 错误韧性、state 正确更新

## Capabilities

### New Capabilities
- `runner-loop-integration`: 对 `runner.run()` 的 async 主循环做集成级测试，mock 所有 phase 和 eval 函数

### Modified Capabilities

## Impact

- **测试数**：从 104 增加到 ~110
- **运行时间**：仍 < 1s
- **覆盖盲区消除**：runner.run() 的编排逻辑从"手动验证"变为"自动化回归"
