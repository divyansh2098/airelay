import { TaskState, ALL_TASK_STATES } from "../state/task-state.js";

export interface PlanTask {
  id: string;
  title: string;
  status: TaskState;
  check?: string;
  notes: string;
  reviewRound: number;
}

export interface Plan {
  header: string;
  tasks: PlanTask[];
}

export class PlanParseError extends Error {
  constructor(message: string, lineNumber?: number) {
    super(lineNumber ? `PLAN.md parse error at line ${lineNumber}: ${message}` : `PLAN.md parse error: ${message}`);
    this.name = "PlanParseError";
  }
}

const TASK_HEADER_RE = /^- \[(x| )\] ([A-Za-z0-9]+): (.+?)\s*$/;
const FIELD_RE = /^ {2}- ([a-z_]+):\s*(.*)$/;
const TASK_ID_RE = /^[A-Za-z0-9]+$/;

export function parsePlan(raw: string): Plan {
  const lines = raw.split("\n");
  let i = 0;

  const headerLines: string[] = [];
  while (i < lines.length && !lines[i].startsWith("- [")) {
    headerLines.push(lines[i]);
    i++;
  }
  const header = headerLines.join("\n").replace(/\n+$/, "");

  const tasks: PlanTask[] = [];
  const seenIds = new Set<string>();

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      i++;
      continue;
    }

    const headerMatch = line.match(TASK_HEADER_RE);
    if (!headerMatch) {
      throw new PlanParseError(`expected task header line, got: ${line}`, i + 1);
    }

    const id = headerMatch[2];
    const title = headerMatch[3];
    if (!TASK_ID_RE.test(id)) {
      throw new PlanParseError(`invalid task id "${id}"`, i + 1);
    }
    if (seenIds.has(id)) {
      throw new PlanParseError(`duplicate task id "${id}"`, i + 1);
    }
    seenIds.add(id);
    i++;

    const fields = new Map<string, string>();
    while (i < lines.length && lines[i].startsWith("  - ")) {
      const fieldMatch = lines[i].match(FIELD_RE);
      if (!fieldMatch) {
        throw new PlanParseError(`expected field line, got: ${lines[i]}`, i + 1);
      }
      fields.set(fieldMatch[1], fieldMatch[2]);
      i++;
    }

    tasks.push(buildTask(id, title, fields, i));
  }

  return { header, tasks };
}

function buildTask(
  id: string,
  title: string,
  fields: Map<string, string>,
  lineNumber: number,
): PlanTask {
  const statusRaw = fields.get("status");
  if (statusRaw === undefined) {
    throw new PlanParseError(`task ${id} is missing required field "status"`, lineNumber);
  }
  if (!ALL_TASK_STATES.includes(statusRaw as TaskState)) {
    throw new PlanParseError(
      `task ${id} has invalid status "${statusRaw}"; expected one of ${ALL_TASK_STATES.join(", ")}`,
      lineNumber,
    );
  }

  const reviewRoundRaw = fields.get("review_round");
  if (reviewRoundRaw === undefined) {
    throw new PlanParseError(`task ${id} is missing required field "review_round"`, lineNumber);
  }
  const reviewRound = Number(reviewRoundRaw);
  if (!Number.isInteger(reviewRound) || reviewRound < 0) {
    throw new PlanParseError(
      `task ${id} has invalid review_round "${reviewRoundRaw}"; expected non-negative integer`,
      lineNumber,
    );
  }

  if (!fields.has("notes")) {
    throw new PlanParseError(`task ${id} is missing required field "notes"`, lineNumber);
  }

  return {
    id,
    title,
    status: statusRaw as TaskState,
    check: fields.get("check") || undefined,
    notes: fields.get("notes") ?? "",
    reviewRound,
  };
}

export function writePlan(plan: Plan): string {
  const parts: string[] = [];
  if (plan.header.length > 0) {
    parts.push(plan.header);
    parts.push("");
  }

  for (const task of plan.tasks) {
    const checkbox = task.status === "done" ? "x" : " ";
    parts.push(`- [${checkbox}] ${task.id}: ${task.title}`);
    parts.push(`  - status: ${task.status}`);
    if (task.check !== undefined) {
      parts.push(`  - check: ${task.check}`);
    }
    parts.push(`  - notes: ${task.notes}`);
    parts.push(`  - review_round: ${task.reviewRound}`);
    parts.push("");
  }

  return parts.join("\n").replace(/\n+$/, "\n");
}

export function findNextActionable(plan: Plan): PlanTask | undefined {
  return plan.tasks.find(
    (t) => t.status === "not_started" || t.status === "needs_rework" || t.status === "in_progress",
  );
}

export function findReadyForReview(plan: Plan): PlanTask | undefined {
  return plan.tasks.find((t) => t.status === "ready_for_review");
}

export function getTask(plan: Plan, id: string): PlanTask | undefined {
  return plan.tasks.find((t) => t.id === id);
}
