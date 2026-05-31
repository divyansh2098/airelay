import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { mkdtempSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createSandbox, SandboxError } from "../src/agent/sandbox.js";

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "aih-sb-"));
  mkdirSync(join(root, "subdir"), { recursive: true });
  return root;
}

test("createSandbox resolves a relative file under root", () => {
  const root = tempRoot();
  const sb = createSandbox(root);
  assert.equal(sb.resolvePath("PLAN.md"), join(root, "PLAN.md"));
  assert.equal(sb.resolvePath("subdir/x.txt"), join(root, "subdir", "x.txt"));
});

test("createSandbox rejects absolute paths", () => {
  const sb = createSandbox(tempRoot());
  assert.throws(() => sb.resolvePath("/etc/passwd"), SandboxError);
});

test("createSandbox rejects parent-traversal escapes", () => {
  const sb = createSandbox(tempRoot());
  assert.throws(() => sb.resolvePath("../etc/passwd"), SandboxError);
  assert.throws(() => sb.resolvePath("subdir/../../escape"), SandboxError);
});

test("createSandbox rejects empty path", () => {
  const sb = createSandbox(tempRoot());
  assert.throws(() => sb.resolvePath(""), SandboxError);
});

test("createSandbox rejects the root itself (no operation on root dir)", () => {
  const root = tempRoot();
  const sb = createSandbox(root);
  assert.throws(() => sb.resolvePath("."), SandboxError);
});
