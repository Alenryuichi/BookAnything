# 仓库目录布局

| 目录 | 职责 |
|------|------|
| `pyharness/` | Python 编排引擎（Plan → Write → Improve → Review → Build → Test → Eval） |
| `pyharness/phases/` | 各阶段实现（plan/write/improve/review/build/visual_test） |
| `projects/` | 项目配置 YAML（书名、章节列表、源码路径、大纲） |
| `knowledge/{项目名}/chapters/` | 生成的章节 JSON 文件 |
| `output/logs/` | 运行日志、阶段提示、原始 Claude 响应 |
| `output/screenshots/` | Playwright 视觉测试截图和报告 |
| `web-app/` | Next.js 动态站点（standalone 模式），读取 knowledge 渲染书籍 |
| `scripts/` | 辅助脚本（preview.sh、rebuild-index.sh、visual-test.js） |
| `tests/` | 单元测试和 E2E 测试 |
| `tests/e2e/` | E2E 测试套件（fixture-repo、golden data、pipeline 测试） |
| `openspec/` | OpenSpec 变更管理（harness 演进用） |
| `.claude/` | Claude Code 能力层（rules/skills/agents/commands/hooks） |

## 关键文件

- `state.json` — 当前运行状态（iteration、score、phase、history）
- `knowledge/index.json` — 书籍索引（名称、章节数、分数、更新时间）
- `goals.yaml` — 通用质量标准和评分权重
- `CLAUDE.md` — 写作风格总纲和规则索引
- `.harness.lock` — 防重入锁文件
- `pyproject.toml` — Python 包配置和 pytest 选项
