import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { readFileTool } from "../src/agent/tools/read-file.js";
import { writeFileTool } from "../src/agent/tools/write-file.js";
import { editFileTool } from "../src/agent/tools/edit-file.js";
import { buildDoneTool, DoneSlot } from "../src/agent/tools/done.js";
import { ToolContext } from "../src/agent/types.js";

function tempCtx(): ToolContext {
  const root = mkdtempSync(join(tmpdir(), "aih-tools-"));
  mkdirSync(join(root, "workspace"));
  mkdirSync(join(root, "runs"));
  return {
    workspaceRoot: join(root, "workspace"),
    ideaRoot: root,
    runLogPath: join(root, "runs", "test.log"),
    appendRunLog: () => {},
    bashTimeoutMs: 5000,
  };
}

test("read_file returns file contents", async () => {
  const ctx = tempCtx();
  writeFileSync(join(ctx.ideaRoot, "PLAN.md"), "hello");
  const result = await readFileTool.handler({ path: "PLAN.md" }, ctx);
  assert.equal(result.output, "hello");
});

test("read_file rejects directory", async () => {
  const ctx = tempCtx();
  const result = await readFileTool.handler({ path: "workspace" }, ctx);
  assert.equal(result.isError, true);
});

test("read_file rejects sandbox escape", async () => {
  const ctx = tempCtx();
  await assert.rejects(async () => readFileTool.handler({ path: "../escape" }, ctx));
});

test("write_file creates file and intermediate dirs", async () => {
  const ctx = tempCtx();
  await writeFileTool.handler({ path: "workspace/src/index.ts", content: "x" }, ctx);
  assert.equal(readFileSync(join(ctx.ideaRoot, "workspace/src/index.ts"), "utf8"), "x");
});

test("edit_file replaces unique occurrence", async () => {
  const ctx = tempCtx();
  writeFileSync(join(ctx.ideaRoot, "f.txt"), "alpha beta gamma");
  const result = await editFileTool.handler(
    { path: "f.txt", old_string: "beta", new_string: "BETA" },
    ctx,
  );
  assert.equal(result.isError ?? false, false);
  assert.equal(readFileSync(join(ctx.ideaRoot, "f.txt"), "utf8"), "alpha BETA gamma");
});

test("edit_file fails on non-unique without replace_all", async () => {
  const ctx = tempCtx();
  writeFileSync(join(ctx.ideaRoot, "f.txt"), "x x x");
  const result = await editFileTool.handler(
    { path: "f.txt", old_string: "x", new_string: "y" },
    ctx,
  );
  assert.equal(result.isError, true);
  assert.match(result.output, /3 times/);
});

test("edit_file with replace_all replaces every occurrence", async () => {
  const ctx = tempCtx();
  writeFileSync(join(ctx.ideaRoot, "f.txt"), "x x x");
  await editFileTool.handler(
    { path: "f.txt", old_string: "x", new_string: "y", replace_all: true },
    ctx,
  );
  assert.equal(readFileSync(join(ctx.ideaRoot, "f.txt"), "utf8"), "y y y");
});

test("edit_file fails when old_string not found", async () => {
  const ctx = tempCtx();
  writeFileSync(join(ctx.ideaRoot, "f.txt"), "abc");
  const result = await editFileTool.handler(
    { path: "f.txt", old_string: "zzz", new_string: "y" },
    ctx,
  );
  assert.equal(result.isError, true);
});

test("edit_file rejects empty old_string", async () => {
  const ctx = tempCtx();
  writeFileSync(join(ctx.ideaRoot, "f.txt"), "abc");
  const result = await editFileTool.handler(
    { path: "f.txt", old_string: "", new_string: "y" },
    ctx,
  );
  assert.equal(result.isError, true);
});

test("done tool stores signal", async () => {
  const slot: DoneSlot = { signal: null };
  const tool = buildDoneTool(slot);
  await tool.handler({ reason: "task_complete", note: "ok" }, tempCtx());
  assert.equal(slot.signal?.reason, "task_complete");
  assert.equal(slot.signal?.note, "ok");
});

test("done tool rejects invalid reason", async () => {
  const slot: DoneSlot = { signal: null };
  const tool = buildDoneTool(slot);
  const result = await tool.handler({ reason: "bogus" }, tempCtx());
  assert.equal(result.isError, true);
  assert.equal(slot.signal, null);
});

test("write_file rejects sandbox escape", async () => {
  const ctx = tempCtx();
  await assert.rejects(async () => writeFileTool.handler({ path: "/etc/x", content: "y" }, ctx));
  assert.equal(existsSync("/etc/x"), false);
});
