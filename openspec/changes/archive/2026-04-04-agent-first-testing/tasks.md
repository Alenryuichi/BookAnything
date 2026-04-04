## 1. Fixtures

- [x] 1.1 创建 `tests/fixtures/` 目录
- [x] 1.2 录制真实 plan CLI 响应存为 `tests/fixtures/cli_plan_response.json`（从 `output/logs/*plan*.raw.json` 复制一份）
- [x] 1.3 录制真实 chapter CLI 响应存为 `tests/fixtures/cli_chapter_response.json`（从 `output/logs/*write*.raw.json` 复制一份）

## 2. Claude Client 契约测试

- [x] 2.1 创建 `tests/test_claude_client.py`，mock `asyncio.create_subprocess_exec`
- [x] 2.2 测试 argv 拼装：默认参数、自定义 CLAUDE_CMD、有/无 allowedTools、自定义 max_turns
- [x] 2.3 测试 `_extract_json()` 所有变体：纯 JSON、markdown 包裹、prose 前缀/后缀、空输入、非 JSON
- [x] 2.4 测试 response_model 验证：有效 PlanOutput、无效数据抛 ValueError
- [x] 2.5 测试错误处理：CLI exit code != 0 抛 RuntimeError
- [x] 2.6 测试超时：mock 慢响应，验证 TimeoutError
- [x] 2.7 测试用真实 fixture 解析：mock subprocess 返回 fixture 内容，验证端到端解析

## 3. Runner 状态机测试

- [x] 3.1 创建 `tests/test_runner.py`，mock 所有 phase 函数 + eval 函数
- [x] 3.2 测试正常循环：7 phase 按顺序执行
- [x] 3.3 测试条件跳过：plan.needs_webapp_improve=False 跳过 improve
- [x] 3.4 测试空 chapters：plan 返回空列表时 write 跳过但循环继续
- [x] 3.5 测试分数达标停止：eval 返回 >= threshold 时 break
- [x] 3.6 测试时间超限停止：elapsed > max_hours 时 break
- [x] 3.7 测试 phase 错误韧性：improve/review/visual_test 抛异常时 warn 并继续
- [x] 3.8 测试 lock 文件：创建、冲突检测、退出清理

## 4. 运行验证

- [x] 4.1 运行 `pytest tests/ -v` 确认全部通过（目标 ~75 tests, < 1s）
