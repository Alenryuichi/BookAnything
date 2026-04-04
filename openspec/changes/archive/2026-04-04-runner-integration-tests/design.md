## Context

`runner.run()` 内部通过 lazy import 调用 7 个 phase 函数。每个 import 写在函数体内：`from pyharness.phases.plan import step_plan`。调研确认 patch 源模块路径 `pyharness.phases.plan.step_plan` 可以拦截 lazy import 的调用。

## Goals / Non-Goals

**Goals:**
- 测试 `runner.run()` 的完整 async 编排逻辑
- 验证 phase 执行顺序、条件跳过、停止条件、错误韧性
- 所有测试在 < 1s 内完成

**Non-Goals:**
- 不测各 phase 内部逻辑（已有独立测试）
- 不做真实 Claude 调用

## Decisions

### D1: Patch 路径

对 lazy import 的函数，patch 其源模块：
- `pyharness.phases.plan.step_plan`
- `pyharness.phases.write.step_write_chapters`
- `pyharness.phases.improve.step_improve_webapp`
- `pyharness.phases.review.step_code_review`
- `pyharness.phases.build.step_build_site`
- `pyharness.phases.build.step_checkpoint`
- `pyharness.phases.visual_test.step_visual_test`

对 eval 函数（直接 import 在 runner.py 顶部）：
- `pyharness.eval.eval_content`
- `pyharness.eval.eval_visual`
- `pyharness.eval.eval_interaction`

对 asyncio.sleep：
- `pyharness.runner.asyncio.sleep`

### D2: 控制循环终止

每个测试用以下策略之一让 `run()` 退出：
- **分数达标**：mock eval 返回 score >= threshold
- **时间超限**：mock `time.time()` 让 elapsed > max_hours
- **单次迭代**：设 max_hours 极小，第二轮 time check 触发退出

### D3: Phase 调用追踪

用一个共享的 `call_order: list[str]` 列表，每个 mock phase 在调用时 append 自己的名字，测试后断言列表内容和顺序。
