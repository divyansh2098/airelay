export interface ContextWatcherInput {
  contextWindow: number;
  threshold: number;
}

export interface ContextWatcher {
  observe: (inputTokens: number) => void;
  shouldWarn: () => boolean;
  hasWarned: () => boolean;
  markWarned: () => void;
  lastInputTokens: () => number;
}

export function createContextWatcher(input: ContextWatcherInput): ContextWatcher {
  if (input.contextWindow <= 0) {
    throw new Error("contextWindow must be > 0");
  }
  if (input.threshold <= 0 || input.threshold >= 1) {
    throw new Error("threshold must be in (0, 1)");
  }

  const limit = Math.floor(input.contextWindow * input.threshold);
  let lastSeen = 0;
  let warned = false;

  return {
    observe: (n: number) => {
      lastSeen = n;
    },
    shouldWarn: () => !warned && lastSeen >= limit,
    hasWarned: () => warned,
    markWarned: () => {
      warned = true;
    },
    lastInputTokens: () => lastSeen,
  };
}

export const WRAP_UP_MESSAGE =
  "You are approaching the context window limit. Do not start any new edits. " +
  "Save your current state: update PLAN.md (statuses, notes) and JOURNAL.md " +
  "(one-line entry describing the next concrete step), then call the `done` tool with reason='context_limit'. " +
  "A fresh agent will continue from the journal and PLAN.md.";
