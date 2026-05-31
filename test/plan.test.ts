import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parsePlan,
  writePlan,
  findNextActionable,
  findReadyForReview,
  getTask,
  PlanParseError,
} from "../src/plan/plan.js";

const SAMPLE = `# Plan for thing

Some intro paragraph.

- [ ] T1: Scaffold app
  - status: not_started
  - check: checks/task_T1.sh
  - notes:
  - review_round: 0

- [ ] T2: Add auth
  - status: in_progress
  - notes: stubbed JWT verify; need to wire to user store
  - review_round: 0

- [x] T3: Health endpoint
  - status: done
  - notes:
  - review_round: 1
`;

test("parsePlan reads a well-formed plan", () => {
  const plan = parsePlan(SAMPLE);
  assert.equal(plan.tasks.length, 3);
  assert.equal(plan.tasks[0].id, "T1");
  assert.equal(plan.tasks[0].status, "not_started");
  assert.equal(plan.tasks[0].check, "checks/task_T1.sh");
  assert.equal(plan.tasks[1].notes, "stubbed JWT verify; need to wire to user store");
  assert.equal(plan.tasks[2].reviewRound, 1);
  assert.ok(plan.header.includes("Plan for thing"));
});

test("writePlan round-trips parsePlan output", () => {
  const plan = parsePlan(SAMPLE);
  const written = writePlan(plan);
  const reparsed = parsePlan(written);
  assert.deepEqual(reparsed.tasks, plan.tasks);
});

test("parsePlan rejects unknown status", () => {
  const bad = SAMPLE.replace("status: not_started", "status: pending");
  assert.throws(() => parsePlan(bad), PlanParseError);
});

test("parsePlan rejects duplicate task ids", () => {
  const bad = SAMPLE.replace("T2: Add auth", "T1: Add auth");
  assert.throws(() => parsePlan(bad), PlanParseError);
});

test("parsePlan rejects missing required field", () => {
  const bad = SAMPLE.replace("  - review_round: 0\n", "");
  assert.throws(() => parsePlan(bad), PlanParseError);
});

test("findNextActionable picks first non-done task", () => {
  const plan = parsePlan(SAMPLE);
  const next = findNextActionable(plan);
  assert.equal(next?.id, "T1");
});

test("findNextActionable picks needs_rework over later not_started", () => {
  const raw = SAMPLE.replace("status: not_started", "status: needs_rework").replace(
    "  - notes:\n  - review_round: 0",
    "  - notes:\n  - review_round: 1",
  );
  const plan = parsePlan(raw);
  const next = findNextActionable(plan);
  assert.equal(next?.id, "T1");
  assert.equal(next?.status, "needs_rework");
});

test("findReadyForReview returns undefined when none", () => {
  const plan = parsePlan(SAMPLE);
  assert.equal(findReadyForReview(plan), undefined);
});

test("findReadyForReview finds the right task", () => {
  const raw = SAMPLE.replace("status: in_progress", "status: ready_for_review");
  const plan = parsePlan(raw);
  assert.equal(findReadyForReview(plan)?.id, "T2");
});

test("getTask looks up by id", () => {
  const plan = parsePlan(SAMPLE);
  assert.equal(getTask(plan, "T2")?.title, "Add auth");
  assert.equal(getTask(plan, "TX"), undefined);
});

test("writePlan emits 'done' tasks with [x] checkbox", () => {
  const plan = parsePlan(SAMPLE);
  const written = writePlan(plan);
  assert.ok(written.includes("- [x] T3:"));
  assert.ok(written.includes("- [ ] T1:"));
});
