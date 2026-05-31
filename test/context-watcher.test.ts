import { test } from "node:test";
import assert from "node:assert/strict";
import { createContextWatcher } from "../src/agent/context-watcher.js";

test("watcher does not warn below threshold", () => {
  const w = createContextWatcher({ contextWindow: 1000, threshold: 0.7 });
  w.observe(500);
  assert.equal(w.shouldWarn(), false);
  w.observe(699);
  assert.equal(w.shouldWarn(), false);
});

test("watcher warns at and above threshold", () => {
  const w = createContextWatcher({ contextWindow: 1000, threshold: 0.7 });
  w.observe(700);
  assert.equal(w.shouldWarn(), true);
});

test("watcher warns only once", () => {
  const w = createContextWatcher({ contextWindow: 1000, threshold: 0.5 });
  w.observe(800);
  assert.equal(w.shouldWarn(), true);
  w.markWarned();
  assert.equal(w.shouldWarn(), false);
  assert.equal(w.hasWarned(), true);
});

test("watcher rejects bad config", () => {
  assert.throws(() => createContextWatcher({ contextWindow: 0, threshold: 0.5 }));
  assert.throws(() => createContextWatcher({ contextWindow: 100, threshold: 0 }));
  assert.throws(() => createContextWatcher({ contextWindow: 100, threshold: 1 }));
});
