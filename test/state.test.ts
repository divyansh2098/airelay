import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canTransition,
  transition,
  isTerminal,
  InvalidTransitionError,
} from "../src/state/task-state.js";

test("not_started -> in_progress is allowed", () => {
  assert.equal(transition("not_started", "in_progress"), "in_progress");
});

test("in_progress -> ready_for_review is allowed", () => {
  assert.equal(transition("in_progress", "ready_for_review"), "ready_for_review");
});

test("ready_for_review -> done is allowed", () => {
  assert.equal(transition("ready_for_review", "done"), "done");
});

test("ready_for_review -> needs_rework is allowed", () => {
  assert.equal(transition("ready_for_review", "needs_rework"), "needs_rework");
});

test("needs_rework -> in_progress is allowed", () => {
  assert.equal(transition("needs_rework", "in_progress"), "in_progress");
});

test("not_started -> done is NOT allowed", () => {
  assert.equal(canTransition("not_started", "done"), false);
  assert.throws(() => transition("not_started", "done"), InvalidTransitionError);
});

test("done is terminal", () => {
  assert.equal(isTerminal("done"), true);
  assert.equal(canTransition("done", "in_progress"), false);
});

test("in_progress -> not_started is NOT allowed (no rewinding)", () => {
  assert.equal(canTransition("in_progress", "not_started"), false);
});

test("ready_for_review -> in_progress is NOT allowed (must go through needs_rework)", () => {
  assert.equal(canTransition("ready_for_review", "in_progress"), false);
});
