## 1. Runner 集成测试

- [x] 1.1 创建 `tests/test_runner_integration.py`，设置 fixture：tmp_path runner + patch 所有 phase 源模块 + patch asyncio.sleep
- [x] 1.2 测试正常循环：7 phase 按顺序执行（plan, write, improve, review, build, visual_test, eval），分数达标后停止
- [x] 1.3 测试条件跳过 improve：plan.needs_webapp_improve=False 时 improve 不在 call_order 中
- [x] 1.4 测试分数达标停止：eval 返回 >= threshold，循环只跑 1 轮
- [x] 1.5 测试时间超限停止：mock time.time() 让 elapsed 超限，循环在下一轮 time check 退出
- [x] 1.6 测试 phase 错误韧性：improve 抛异常后 review/build/eval 仍执行
- [x] 1.7 测试 state 更新：eval 完成后 state.json 有正确的 iteration 和 score

## 2. 验证

- [x] 2.1 运行 `pytest tests/ -v --ignore=tests/agent/test_e2e_convergence.py` 确认全部通过
