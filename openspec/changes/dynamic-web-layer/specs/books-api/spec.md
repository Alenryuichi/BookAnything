## ADDED Requirements

### Requirement: GET /api/books returns book list
API MUST 提供 `GET /api/books` 端点，返回 JSON 格式的书籍列表。响应 MUST 包含 `books` 数组，每个条目包含 `id`、`name`、`description`、`language`、`chapterCount`、`writtenCount`、`lastUpdated`、`score`、`stats`。

#### Scenario: Multiple books exist
- **WHEN** 客户端请求 `GET /api/books`
- **THEN** 响应 status MUST 为 200，body MUST 包含所有已索引书籍的元数据

#### Scenario: No books exist
- **WHEN** `knowledge/index.json` 为空或不存在
- **THEN** 响应 status MUST 为 200，body MUST 为 `{ "books": [] }`

#### Scenario: Refresh parameter
- **WHEN** 客户端请求 `GET /api/books?refresh=true`
- **THEN** 系统 MUST 先重建 `knowledge/index.json` 再返回结果

### Requirement: GET /api/books/[bookId]/chapters returns chapter list
API MUST 提供 `GET /api/books/[bookId]/chapters` 端点，返回该书的章节列表（不含完整内容）。每个章节条目 MUST 包含 `chapter_id`、`title`、`subtitle`、`word_count`、`sectionCount`。

#### Scenario: Valid book with chapters
- **WHEN** 客户端请求 `GET /api/books/claude-code/chapters`
- **THEN** 响应 MUST 包含该书所有章节的摘要信息，按章节 ID 排序

#### Scenario: Invalid book ID
- **WHEN** 客户端请求 `GET /api/books/nonexistent/chapters`
- **THEN** 响应 status MUST 为 404，body MUST 包含 `error` 字段

### Requirement: GET /api/books/[bookId]/chapters/[chapterId] returns chapter content
API MUST 提供 `GET /api/books/[bookId]/chapters/[chapterId]` 端点，返回单个章节的完整 JSON 内容。

#### Scenario: Valid chapter
- **WHEN** 客户端请求 `GET /api/books/claude-code/chapters/ch01-what-is-claude-code`
- **THEN** 响应 MUST 包含完整的 `ChapterContent` 对象，经过 Zod schema 校验

#### Scenario: Chapter not found
- **WHEN** 客户端请求不存在的章节 ID
- **THEN** 响应 status MUST 为 404

### Requirement: API response format
所有 API 响应 MUST 使用 `Content-Type: application/json`，成功响应 MUST 包含数据对象，错误响应 MUST 包含 `{ "error": "描述" }` 格式。

#### Scenario: Error response format
- **WHEN** API 端点遇到错误
- **THEN** 响应 MUST 返回对应 HTTP status code（400/404/500）和 `{ "error": "..." }` body
