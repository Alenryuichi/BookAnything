import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import { loadChapterOutline } from "./chapter-outline.mjs";

test("loadChapterOutline returns parsed outline when file exists", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "outline-loader-"));
  fs.writeFileSync(
    path.join(tmpDir, "chapter-outline.json"),
    JSON.stringify({
      version: "1.0",
      generated_at: "2026-04-05T00:00:00Z",
      algorithm: { community_method: "louvain" },
      parts: [
        {
          part_num: 1,
          part_title: "Core Flows",
          community_id: "c0",
          kg_node_ids: ["concept-auth"],
          chapters: [
            {
              id: "ch01-auth",
              title: "Auth",
              subtitle: "Flow",
              kg_coverage: ["concept-auth"],
              prerequisites: [],
              topo_rank: 0,
            },
          ],
        },
      ],
      uncovered_nodes: ["concept-unused"],
    }),
  );

  const outline = loadChapterOutline(tmpDir);

  assert.ok(outline);
  assert.equal(outline.parts[0].chapters[0].id, "ch01-auth");
  assert.deepEqual(outline.uncovered_nodes, ["concept-unused"]);
});

test("loadChapterOutline returns null when file is missing", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "outline-loader-"));
  assert.equal(loadChapterOutline(tmpDir), null);
});
