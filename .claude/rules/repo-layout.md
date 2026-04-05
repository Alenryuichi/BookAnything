# 仓库目录布局

| 目录 | 职责 |
|------|------|
| `projects/` | 项目配置 YAML（书名、章节列表、源码路径、大纲） |
| `prompts/` | 早期提示模板（plan/analyze/evaluate），已部分被 `run.sh` heredoc 取代 |
| `knowledge/{项目名}/chapters/` | 生成的章节 JSON 文件 |
| `knowledge/{项目名}/modules/` | 旧版模块分析数据（向后兼容） |
| `output/logs/` | 运行日志、阶段提示、原始 Claude 响应 |
| `output/screenshots/` | Playwright 视觉测试截图和报告 |
| `web-app/` | Next.js 静态站点，读取 knowledge 渲染书籍 |
| `scripts/` | 辅助脚本（status.sh、preview.sh、reset.sh、visual-test.js） |
| `openspec/` | OpenSpec 变更管理（harness 演进用） |
| `.claude/` | Claude Code 能力层（rules/skills/agents/commands/hooks） |

## 关键文件

- `run.sh` — 主循环驱动（Plan → Write → Improve → Review → Build → Test → Eval）
- `state.json` — 当前运行状态（iteration、score、phase、history）
- `goals.yaml` — 通用质量标准和评分权重
- `CLAUDE.md` — 写作风格总纲和规则索引
- `.harness.lock` — 防重入锁文件
