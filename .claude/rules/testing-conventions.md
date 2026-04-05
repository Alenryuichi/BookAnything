# 测试约定

## 测试层级

| 层级 | 目录 | 需要 Claude CLI | 运行方式 |
|------|------|----------------|---------|
| **单元测试** | `tests/test_*.py` | 否 | `pytest tests/ --ignore=tests/agent --ignore=tests/agent_fixtures -m "not live"` |
| **E2E 录制** | `tests/e2e/test_pipeline.py` | 否（mock） | 同上（默认包含） |
| **E2E 真实** | `tests/e2e/test_live.py` | 是 | `pytest tests/e2e/test_live.py -m live` |
| **收敛测试** | `tests/agent/test_e2e_convergence.py` | 是 | `pytest -m slow` |

## 修改代码后必须运行

```bash
python3 -m pytest tests/ --ignore=tests/agent --ignore=tests/agent_fixtures -m "not live" -v
```

预期：所有测试通过，耗时 < 60 秒，零 API 成本。

## E2E Fixture 项目

`tests/e2e/fixture-repo/` 是一个 ~300 行的 Python 项目（MiniPipe），专供测试使用。

- **不要修改** fixture-repo 的源码，除非测试本身需要变更
- `tests/e2e/fixture-project.yaml` — 对应的 4 章项目配置
- `tests/e2e/golden/` — 录制的 Claude 响应和预验证章节 JSON
- 录制数据在 prompt 大幅变化时需要重新生成

## Golden Data 更新

当 planning/writing prompt 发生重大变化时：

```bash
python3 -m pyharness init tests/e2e/fixture-repo
python3 -m pyharness run --project tests/e2e/fixture-project.yaml --max-iterations 1
```

然后将 CLI 输出和生成的章节复制到 `tests/e2e/golden/`。

## ClaudeClient 测试

`ClaudeClient` 使用 `_run_once()` 作为单次调用的内部方法。E2E 测试通过 patch 这个方法来注入录制响应。新增 ClaudeClient 功能时，需在 `tests/test_claude_client.py` 中补充对应的 mock 测试。
