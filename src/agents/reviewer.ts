import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { AgentDefinition, AgentContext, Tool } from "../agent/types.js";
import { readFileTool } from "../agent/tools/read-file.js";
import { runBashTool } from "../agent/tools/run-bash.js";
import {
  buildRecordFindingTool,
  ReviewSlot,
  reviewFilePath,
} from "../agent/tools/record-finding.js";

const SYSTEM_PROMPT = `You are the REVIEWER agent in a three-agent workflow.

Your role:
- You are given the IDEA.md, the title of one task, the staged git diff for that task, and any findings from previous review rounds for the same task.
- Judge whether the diff actually delivers what the idea + task title imply.
- Record EACH issue you find with the \`record_finding\` tool: one call per finding.
- When done, call \`done\` with reason='approved' (no blockers) or 'needs_rework' (one or more blockers).

What to check (objective):
- Does the diff implement the task as described?
- Tests, type checks, builds: run them via run_bash if useful (use the workspace dir).
- Obvious bugs, broken edge cases, missing error handling at boundaries.

What to check (subjective — be a critic, not a collaborator):
- Naming: does it read naturally? Are public APIs clear?
- Error messages: are they actionable? Do they say what's wrong AND how to fix?
- Over-engineering: unused parameters, premature abstractions, half-finished hypotheticals.
- Comments: are they explaining WHY (good) or WHAT (delete-worthy)?

Severity guidance:
- blocker: shipping this would be wrong (broken behavior, security issue, contradicts the idea).
- concern: should fix unless there's a reason; would slow a future engineer down.
- nit: minor; reasonable people might disagree.

Hard rules:
- You may NOT modify code (no write_file, no edit_file). If you spot something, record a finding.
- You may NOT read PLAN.md or JOURNAL.md — they would bias you toward what the implementer thinks they did.
- You may run tests, type checks, lints in the workspace via run_bash.
- Approve if zero blockers. If any blocker is recorded, call done with reason='needs_rework'.
- If you cannot review (e.g., diff is empty, idea is unclear), call done with reason='blocked' and explain in the note.
`;

export interface ReviewerSessionInput {
  taskId: string;
  taskTitle: string;
  round: number;
  diff: string;
}

export function buildReviewerAgent(session: ReviewerSessionInput): AgentDefinition {
  return {
    name: "reviewer",
    systemPrompt: SYSTEM_PROMPT,
    tools: buildReviewerTools(session),
    allowedDoneReasons: ["approved", "needs_rework", "blocked"],
    buildInitialUserMessage: (ctx) => buildInitialMessage(ctx, session),
  };
}

function buildReviewerTools(session: ReviewerSessionInput): Tool[] {
  return [
    readFileTool,
    runBashTool,
    buildRecordFindingToolForSession(session),
  ];
}

function buildRecordFindingToolForSession(session: ReviewerSessionInput): Tool {
  const baseTool = buildRecordFindingTool({
    taskId: session.taskId,
    round: session.round,
    reviewFilePath: "",
  });
  return {
    definition: baseTool.definition,
    handler: (input, ctx) => {
      const slot: ReviewSlot = {
        taskId: session.taskId,
        round: session.round,
        reviewFilePath: reviewFilePath(ctx.ideaRoot),
      };
      const sessionTool = buildRecordFindingTool(slot);
      return sessionTool.handler(input, ctx);
    },
  };
}

function buildInitialMessage(ctx: AgentContext, session: ReviewerSessionInput): string {
  const ideaPath = join(ctx.ideaRoot, "IDEA.md");
  const reviewPath = join(ctx.ideaRoot, "REVIEW.md");

  const idea = existsSync(ideaPath) ? readFileSync(ideaPath, "utf8") : "(missing)";
  const review = existsSync(reviewPath) ? readFileSync(reviewPath, "utf8") : "";
  const priorFindings = extractPriorFindings(review, session.taskId);

  return [
    `# Review session`,
    "",
    `**Task under review:** \`${session.taskId}\` — ${session.taskTitle}`,
    `**Review round:** ${session.round}`,
    "",
    "## IDEA.md",
    fence(idea),
    "",
    "## Staged diff (the code under review)",
    fence(session.diff || "(no staged changes)"),
    "",
    priorFindings
      ? `## Prior findings for this task\n${fence(priorFindings)}\n\n`
      : "",
    "Review the diff against the idea and task title. Record each finding with `record_finding`. " +
      "When done, call `done` with reason='approved' or 'needs_rework'.",
  ]
    .filter((s) => s.length > 0)
    .join("\n");
}

function extractPriorFindings(reviewMd: string, taskId: string): string {
  if (!reviewMd) return "";
  const headerRe = new RegExp(`### ${taskId} round \\d+`, "g");
  const matches = [...reviewMd.matchAll(headerRe)];
  if (matches.length === 0) return "";

  const sections: string[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index!;
    const nextHeader = reviewMd.slice(start + matches[i][0].length).match(/\n(?:### |## )/);
    const end = nextHeader
      ? start + matches[i][0].length + nextHeader.index!
      : reviewMd.length;
    sections.push(reviewMd.slice(start, end).trim());
  }
  return sections.join("\n\n");
}

function fence(s: string): string {
  return "```\n" + s + "\n```";
}
