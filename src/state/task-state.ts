export type TaskState =
  | "not_started"
  | "in_progress"
  | "ready_for_review"
  | "needs_rework"
  | "done";

export const ALL_TASK_STATES: readonly TaskState[] = [
  "not_started",
  "in_progress",
  "ready_for_review",
  "needs_rework",
  "done",
] as const;

export class InvalidTransitionError extends Error {
  constructor(from: TaskState, to: TaskState) {
    super(`invalid task state transition: ${from} -> ${to}`);
    this.name = "InvalidTransitionError";
  }
}

const ALLOWED: Record<TaskState, readonly TaskState[]> = {
  not_started: ["in_progress"],
  in_progress: ["ready_for_review"],
  ready_for_review: ["done", "needs_rework"],
  needs_rework: ["in_progress"],
  done: [],
};

export function canTransition(from: TaskState, to: TaskState): boolean {
  return ALLOWED[from].includes(to);
}

export function transition(from: TaskState, to: TaskState): TaskState {
  if (!canTransition(from, to)) {
    throw new InvalidTransitionError(from, to);
  }
  return to;
}

export function isTerminal(state: TaskState): boolean {
  return state === "done";
}
