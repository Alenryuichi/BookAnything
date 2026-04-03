显示当前 harness 运行状态。

请执行以下操作并汇总报告：

1. 读取 `state.json`，显示：iteration、score（总分和各维度）、phase、start_time
2. 读取 `output/logs/harness.log` 最后 10 行，显示最近活动
3. 检查 `.harness.lock` 是否存在，如存在显示 PID
4. 统计 `knowledge/` 下各项目的章节数量
5. 检查 `web-app/out/` 是否存在（站点是否已构建）

输出格式：简洁的状态摘要，包含上述所有信息。
