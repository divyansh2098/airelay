import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildRecordFindingTool,
  reviewFilePath,
} from "../src/agent/tools/record-finding.js";
import { ToolContext } from "../src/agent/types.js";

function tempCtx(): ToolContext {
  const root = mkdtempSync(join(tmpdir(), "aih-rf-"));
  mkdirSync(join(root, "workspace"));
  return {
    workspaceRoot: join(root, "workspace"),
    ideaRoot: root,
    runLogPath: join(root, "test.log"),
    appendRunLog: () => {},
    bashTimeoutMs: 5000,
  };
}

test("record_finding creates section header on first call", async () => {
  const ctx = tempCtx();
  const tool = buildRecordFindingTool({
    taskId: "T1",
    round: 1,
    reviewFilePath: reviewFilePath(ctx.ideaRoot),
  });
  await tool.handler(
    { severity: "blocker", summary: "broken thing" },
    ctx,
  );
  const review = readFileSync(reviewFilePath(ctx.ideaRoot), "utf8");
  assert.match(review, /### T1 round 1/);
  assert.match(review, /\*\*\[blocker\]\*\* broken thing/);
});

test("record_finding appends multiple findings under same header", async () => {
  const ctx = tempCtx();
  const tool = buildRecordFindingTool({
    taskId: "T1",
    round: 1,
    reviewFilePath: reviewFilePath(ctx.ideaRoot),
  });
  await tool.handler({ severity: "blocker", summary: "first" }, ctx);
  await tool.handler({ severity: "concern", summary: "second" }, ctx);
  await tool.handler({ severity: "nit", summary: "third" }, ctx);
  const review = readFileSync(reviewFilePath(ctx.ideaRoot), "utf8");
  const headerCount = (review.match(/### T1 round 1/g) ?? []).length;
  assert.equal(headerCount, 1);
  assert.match(review, /first/);
  assert.match(review, /second/);
  assert.match(review, /third/);
});

test("record_finding for new round creates new header below existing", async () => {
  const ctx = tempCtx();
  const tool1 = buildRecordFindingTool({
    taskId: "T1",
    round: 1,
    reviewFilePath: reviewFilePath(ctx.ideaRoot),
  });
  await tool1.handler({ severity: "blocker", summary: "round 1 finding" }, ctx);

  const tool2 = buildRecordFindingTool({
    taskId: "T1",
    round: 2,
    reviewFilePath: reviewFilePath(ctx.ideaRoot),
  });
  await tool2.handler({ severity: "blocker", summary: "round 2 finding" }, ctx);

  const review = readFileSync(reviewFilePath(ctx.ideaRoot), "utf8");
  assert.match(review, /### T1 round 1/);
  assert.match(review, /### T1 round 2/);
  assert.ok(review.indexOf("round 1") < review.indexOf("round 2"));
});

test("record_finding preserves existing standing criteria section", async () => {
  const ctx = tempCtx();
  writeFileSync(
    reviewFilePath(ctx.ideaRoot),
    "## Standing review criteria\n\n- be nice\n- check tests\n",
  );
  const tool = buildRecordFindingTool({
    taskId: "T1",
    round: 1,
    reviewFilePath: reviewFilePath(ctx.ideaRoot),
  });
  await tool.handler({ severity: "blocker", summary: "x" }, ctx);
  const review = readFileSync(reviewFilePath(ctx.ideaRoot), "utf8");
  assert.match(review, /Standing review criteria/);
  assert.match(review, /### T1 round 1/);
  assert.ok(review.indexOf("Standing") < review.indexOf("T1 round"));
});

test("record_finding rejects invalid severity", async () => {
  const ctx = tempCtx();
  const tool = buildRecordFindingTool({
    taskId: "T1",
    round: 1,
    reviewFilePath: reviewFilePath(ctx.ideaRoot),
  });
  const result = await tool.handler({ severity: "huge", summary: "x" }, ctx);
  assert.equal(result.isError, true);
});

test("record_finding rejects empty summary", async () => {
  const ctx = tempCtx();
  const tool = buildRecordFindingTool({
    taskId: "T1",
    round: 1,
    reviewFilePath: reviewFilePath(ctx.ideaRoot),
  });
  const result = await tool.handler({ severity: "nit", summary: "  " }, ctx);
  assert.equal(result.isError, true);
});

test("record_finding indents detail lines under bullet", async () => {
  const ctx = tempCtx();
  const tool = buildRecordFindingTool({
    taskId: "T1",
    round: 1,
    reviewFilePath: reviewFilePath(ctx.ideaRoot),
  });
  await tool.handler(
    {
      severity: "concern",
      summary: "x",
      detail: "line one\nline two",
    },
    ctx,
  );
  const review = readFileSync(reviewFilePath(ctx.ideaRoot), "utf8");
  assert.match(review, /  line one\n  line two/);
});
