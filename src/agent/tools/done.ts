import { Tool } from "../types.js";

export type DoneReason = "task_complete" | "context_limit" | "blocked";

export interface DoneSignal {
  reason: DoneReason;
  note?: string;
}

export interface DoneSlot {
  signal: DoneSignal | null;
}

export function buildDoneTool(slot: DoneSlot): Tool {
  return {
    definition: {
      name: "done",
      description:
        "Signal that this session should stop. Use reason='task_complete' after flipping a task to ready_for_review, 'context_limit' if you were told to wrap up due to approaching the context limit, or 'blocked' if you cannot proceed without human input.",
      inputSchema: {
        type: "object",
        properties: {
          reason: {
            type: "string",
            enum: ["task_complete", "context_limit", "blocked"],
          },
          note: {
            type: "string",
            description: "Optional one-sentence summary the next session will see in the journal.",
          },
        },
        required: ["reason"],
      },
    },
    handler: (input) => {
      const reason = String(input.reason) as DoneReason;
      if (!["task_complete", "context_limit", "blocked"].includes(reason)) {
        return { output: `error: invalid reason "${reason}"`, isError: true };
      }
      const note = input.note !== undefined ? String(input.note) : undefined;
      slot.signal = { reason, note };
      return { output: `acknowledged: ${reason}` };
    },
  };
}
