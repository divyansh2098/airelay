import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { AgentDefinition, AgentContext } from "../agent/types.js";
import { allDefaultTools } from "../agent/tools/registry.js";

const SYSTEM_PROMPT = `You are the IMPLEMENTER agent in a three-agent workflow (planner → implementer → reviewer).

Your role:
- Read PLAN.md, identify the next actionable task (status: not_started, needs_rework, or in_progress).
- Implement exactly that one task. Do not work ahead.
- Update PLAN.md as you go: flip status to in_progress when you start, ready_for_review when you finish.
- Append a brief journal entry to JOURNAL.md when you start and when you stop.
- When done, call the \`done\` tool with reason='task_complete'.

Hard rules:
- One task per session. After flipping a task to ready_for_review, call \`done\` immediately. Do not pick up the next task.
- If a task has status 'needs_rework', read the matching feedback in REVIEW.md first, then address it.
- Do NOT modify any task's status to 'done' — only the reviewer does that.
- Do NOT modify other tasks in PLAN.md. Only the one you're working on.
- All file paths are relative to the idea root. The workspace lives under 'workspace/'.
- If you encounter a problem you cannot resolve (e.g., the plan is contradictory, a dependency is missing), call \`done\` with reason='blocked' and describe the issue in the note.

PLAN.md format (each task is a markdown checkbox followed by 4-5 indented fields):
\`\`\`
- [ ] T1: Title here
  - status: not_started
  - check: checks/task_T1.sh    # optional
  - notes: free-form
  - review_round: 0
\`\`\`

When you finish a task:
1. Run any check script defined in the task's \`check\` field. Fix problems before flipping status.
2. Edit PLAN.md to set status to ready_for_review and update notes if useful.
3. Append a one-line entry to JOURNAL.md: \`<ISO timestamp> | T<id> | ready_for_review | <one-line summary>\`.
4. Call the \`done\` tool with reason='task_complete'.

If you receive a wrap-up instruction (context limit warning):
1. Save current state to PLAN.md (keep status: in_progress, update notes with exact next step).
2. Append a JOURNAL.md entry describing what's done and what's next.
3. Call \`done\` with reason='context_limit'.
`;

export const implementerAgent: AgentDefinition = {
  name: "implementer",
  systemPrompt: SYSTEM_PROMPT,
  tools: allDefaultTools,
  buildInitialUserMessage,
};

function buildInitialUserMessage(context: AgentContext): string {
  const planPath = join(context.ideaRoot, "PLAN.md");
  const reviewPath = join(context.ideaRoot, "REVIEW.md");
  const journalPath = join(context.ideaRoot, "JOURNAL.md");
  const ideaPath = join(context.ideaRoot, "IDEA.md");

  const idea = readIfExists(ideaPath);
  const plan = readIfExists(planPath);
  const review = readIfExists(reviewPath);
  const journal = readIfExists(journalPath);

  const journalTail = tail(journal, 10);

  return [
    `# Idea: ${context.ideaSlug}`,
    "",
    "## IDEA.md",
    fence(idea),
    "",
    "## PLAN.md",
    fence(plan),
    "",
    "## REVIEW.md",
    fence(review),
    "",
    "## Recent JOURNAL.md entries (last 10 lines)",
    fence(journalTail),
    "",
    "Pick up the next actionable task and proceed.",
  ].join("\n");
}

function readIfExists(path: string): string {
  if (!existsSync(path)) return "(file does not exist)";
  const s = readFileSync(path, "utf8");
  return s.length === 0 ? "(empty)" : s;
}

function tail(s: string, n: number): string {
  if (s === "(file does not exist)" || s === "(empty)") return s;
  const lines = s.split("\n");
  return lines.slice(Math.max(0, lines.length - n)).join("\n");
}

function fence(s: string): string {
  return "```\n" + s + "\n```";
}
