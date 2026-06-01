import { Tool, DoneReason } from "../types.js";

export interface DoneSignal {
  reason: DoneReason;
  note?: string;
}

export interface DoneSlot {
  signal: DoneSignal | null;
}

const REASON_DESCRIPTIONS: Record<DoneReason, string> = {
  task_complete: "the assigned task is complete and ready for handoff",
  context_limit: "you were told to wrap up due to approaching the context limit",
  blocked: "you cannot proceed without human input or further information",
  approved: "review passed; the task is approved",
  needs_rework: "review failed; the task needs rework before approval",
};

export function buildDoneTool(slot: DoneSlot, allowedReasons: readonly DoneReason[]): Tool {
  if (allowedReasons.length === 0) {
    throw new Error("buildDoneTool: allowedReasons must be non-empty");
  }
  const allowed = new Set<DoneReason>(allowedReasons);
  const reasonDocLines = allowedReasons
    .map((r) => `  - '${r}': ${REASON_DESCRIPTIONS[r]}`)
    .join("\n");

  return {
    definition: {
      name: "done",
      description:
        `Signal that this session should stop. Allowed reasons:\n${reasonDocLines}\n` +
        "Provide an optional one-sentence note that the next session or human will see.",
      inputSchema: {
        type: "object",
        properties: {
          reason: {
            type: "string",
            enum: [...allowedReasons],
          },
          note: {
            type: "string",
            description: "Optional one-sentence summary.",
          },
        },
        required: ["reason"],
      },
    },
    handler: (input) => {
      const reason = String(input.reason) as DoneReason;
      if (!allowed.has(reason)) {
        return {
          output: `error: invalid reason "${reason}". Allowed: ${[...allowed].join(", ")}`,
          isError: true,
        };
      }
      const note = input.note !== undefined ? String(input.note) : undefined;
      slot.signal = { reason, note };
      return { output: `acknowledged: ${reason}` };
    },
  };
}
