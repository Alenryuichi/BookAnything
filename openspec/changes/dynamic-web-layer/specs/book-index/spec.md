## ADDED Requirements

### Requirement: Book index file format
系统 SHALL 在 `knowledge/index.json` 维护一个书籍元数据索引文件。每本书的条目 MUST 包含以下字段：`id`（URL-safe slug）、`name`（显示名）、`description`、`language`、`chapterCount`（总章节数）、`writtenCount`（已写章节数）、`lastUpdated`（ISO 8601 时间戳）、`score`（最新评估总分，0-100）、`stats`（`{ files, lines }`）。

#### Scenario: Index file exists with multiple books
- **WHEN** `knowledge/` 下存在 `深入理解 Claude Code/chapters/` 和 `Pydantic AI/chapters/` 两个书目录
- **THEN** `knowledge/index.json` 的 `books` 数组 MUST 包含 2 个条目，各自反映对应目录的章节数量

#### Scenario: Index file does not exist
- **WHEN** `knowledge/index.json` 不存在但 `knowledge/` 下有书目录
- **THEN** 系统 MUST 自动重建 index.json（通过 rebuild 脚本或 API `?refresh=true`）

### Requirement: Index auto-update on chapter write
`run.sh` 在写入章节 JSON 后 MUST 更新 `knowledge/index.json` 中对应书的 `writtenCount` 和 `lastUpdated` 字段。

#### Scenario: New chapter written by harness
- **WHEN** `run.sh` 成功写入 `knowledge/Claude Code/chapters/ch05-xxx.json`
- **THEN** `knowledge/index.json` 中 `id: "claude-code"` 条目的 `writtenCount` MUST 递增，`lastUpdated` MUST 更新为当前时间

### Requirement: Index rebuild script
系统 MUST 提供 `scripts/rebuild-index.sh`（或 TS 等价物），扫描 `knowledge/` 所有子目录和 `projects/*.yaml`，重建完整的 `index.json`。

#### Scenario: Rebuild from scratch
- **WHEN** 用户运行 rebuild 脚本
- **THEN** 脚本 MUST 扫描所有 `knowledge/*/chapters/` 目录，统计章节数，读取 `projects/*.yaml` 获取元数据，写入新的 `index.json`

### Requirement: Book ID slug derivation
`id` 字段 MUST 从书名派生为 URL-safe slug：小写、空格替换为 `-`、移除非 ASCII 字符。映射关系 MUST 在 index.json 中持久化。

#### Scenario: Chinese book name slug
- **WHEN** 书名为 "深入理解 Claude Code"
- **THEN** `id` MUST 为 `"claude-code"`（取英文部分）或用可逆映射
