# 源码书籍生成 Harness

撰写一本由浅入深的技术科普书，以交互式网页形式展示目标项目的设计原理。
**不是代码参考手册，是讲故事的技术书。**

## 多项目支持
- 项目配置位于 `projects/*.yaml`（默认 `projects/claude-code.yaml`）
- 知识数据存储在 `knowledge/{项目名}/chapters/` 下

## Rules 设计原则

`.claude/rules/` 中的规则同时服务于两个场景：

1. **开发 harness** — 修改 `pyharness/`、`web-app/`、`tests/` 等代码时
2. **Headless 写书** — 被 pyharness 编排执行 Plan → Write → Eval 流程时

新增或修改任何 rule 时，必须确认在两个场景下都合理。仅开发场景需要的规则用 `globs` 限定触发范围，两个场景都需要的规则标记 `alwaysApply: true`。
