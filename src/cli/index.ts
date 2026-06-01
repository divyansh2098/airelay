#!/usr/bin/env node
import { resolve, join } from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { validateIdea, IdeaValidationError } from "../validator/idea.js";
import { IDEA_TEMPLATE } from "../validator/template.js";
import { provisionIdea, ProvisionError, ideaPaths, ProvisionPaths } from "../provision/provision.js";
import { loadConfig, ConfigError, Config } from "../config/config.js";
import { runAgent } from "../agent/runtime.js";
import { AgentDefinition, AgentResult, StopReason } from "../agent/types.js";
import { implementerAgent } from "../agents/implementer.js";
import { plannerAgent } from "../agents/planner.js";
import { buildReviewerAgent } from "../agents/reviewer.js";
import { parsePlan, writePlan, findReadyForReview, PlanTask } from "../plan/plan.js";
import { transition } from "../state/task-state.js";
import { diffStaged, isRepo, diffUnstaged } from "../git/git.js";

const IDEAS_BASE_DIR = resolve(process.cwd(), "ideas");

interface CommandHandler {
  (args: string[]): Promise<number> | number;
}

const commands: Record<string, CommandHandler> = {
  new: cmdNew,
  init: cmdInit,
  plan: cmdPlan,
  run: cmdRun,
  review: cmdReview,
  loop: cmdNotImplemented("loop"),
  status: cmdNotImplemented("status"),
  help: cmdHelp,
};

async function main(): Promise<void> {
  const [, , subcommand, ...rest] = process.argv;
  if (!subcommand || subcommand === "--help" || subcommand === "-h") {
    cmdHelp();
    process.exit(0);
  }

  const handler = commands[subcommand];
  if (!handler) {
    process.stderr.write(`unknown command: ${subcommand}\n\n`);
    cmdHelp();
    process.exit(2);
  }

  const code = await handler(rest);
  process.exit(code);
}

function cmdHelp(): number {
  process.stdout.write(
    [
      "airelay — three-agent relay (planner / implementer / reviewer) for building ideas from a markdown spec",
      "",
      "Usage:",
      "  airelay new <path-to-idea.md>   Validate an idea file and provision ideas/<slug>/",
      "  airelay init <path>             Write a starter IDEA.md template at <path>",
      "  airelay plan <slug>             Run the planner (interactive)",
      "  airelay run <slug>              Run the implementer until next ready_for_review",
      "  airelay review <slug>           Run the reviewer over the ready_for_review task",
      "  airelay loop <slug>             [stub] Auto-alternate run + review until done",
      "  airelay status <slug>           [stub] Print PLAN.md task summary",
      "  airelay help                    Show this help",
      "",
    ].join("\n"),
  );
  return 0;
}

function cmdNew(args: string[]): number {
  const path = args[0];
  if (!path) {
    process.stderr.write("error: airelay new requires a path to an idea markdown file\n");
    return 2;
  }
  const absolute = resolve(process.cwd(), path);
  if (!existsSync(absolute)) {
    process.stderr.write(`error: file not found: ${absolute}\n`);
    return 2;
  }

  const raw = readFileSync(absolute, "utf8");

  let idea;
  try {
    idea = validateIdea(raw);
  } catch (err) {
    if (err instanceof IdeaValidationError) {
      process.stderr.write(`${err.message}\n`);
      return 2;
    }
    throw err;
  }

  try {
    const paths = provisionIdea(IDEAS_BASE_DIR, idea);
    process.stdout.write(`provisioned: ${paths.root}\n`);
    return 0;
  } catch (err) {
    if (err instanceof ProvisionError) {
      process.stderr.write(`error: ${err.message}\n`);
      return 1;
    }
    throw err;
  }
}

function cmdInit(args: string[]): number {
  const path = args[0];
  if (!path) {
    process.stderr.write("error: airelay init requires a target path\n");
    return 2;
  }
  const absolute = resolve(process.cwd(), path);
  if (existsSync(absolute)) {
    process.stderr.write(`error: file already exists: ${absolute}\n`);
    return 1;
  }
  writeFileSync(absolute, IDEA_TEMPLATE);
  process.stdout.write(`wrote: ${absolute}\n`);
  return 0;
}

function cmdNotImplemented(name: string): CommandHandler {
  return () => {
    process.stderr.write(`airelay ${name}: not implemented yet\n`);
    return 64;
  };
}

async function cmdPlan(args: string[]): Promise<number> {
  const ctx = await loadIdeaContext(args[0], "plan", "planner");
  if (!ctx) return 2;
  const result = await runWithProgress(ctx.config, plannerAgent, {
    ideaSlug: ctx.slug,
    ideaRoot: ctx.paths.root,
    workspaceRoot: ctx.paths.workspaceDir,
    runLogPath: ctx.runLogPath,
  });
  return result.stopReason.kind === "task_complete" ? 0 : 1;
}

async function cmdRun(args: string[]): Promise<number> {
  const ctx = await loadIdeaContext(args[0], "run", "implementer");
  if (!ctx) return 2;
  const result = await runWithProgress(ctx.config, implementerAgent, {
    ideaSlug: ctx.slug,
    ideaRoot: ctx.paths.root,
    workspaceRoot: ctx.paths.workspaceDir,
    runLogPath: ctx.runLogPath,
  });
  return result.stopReason.kind === "task_complete" ||
    result.stopReason.kind === "context_limit"
    ? 0
    : 1;
}

async function cmdReview(args: string[]): Promise<number> {
  const ctx = await loadIdeaContext(args[0], "review", "reviewer");
  if (!ctx) return 2;

  const planPath = join(ctx.paths.root, "PLAN.md");
  if (!existsSync(planPath)) {
    process.stderr.write("error: PLAN.md does not exist (planner has not run yet)\n");
    return 2;
  }
  const planRaw = readFileSync(planPath, "utf8");
  const plan = parsePlan(planRaw);
  const task = findReadyForReview(plan);
  if (!task) {
    process.stderr.write("no task is ready for review.\n");
    return 0;
  }

  const diff = collectDiff(ctx.paths.workspaceDir);
  if (!diff.trim()) {
    process.stderr.write(
      "error: no diff to review (workspace has no staged or unstaged changes)\n",
    );
    return 1;
  }

  const reviewer = buildReviewerAgent({
    taskId: task.id,
    taskTitle: task.title,
    round: task.reviewRound + 1,
    diff,
  });

  const result = await runWithProgress(ctx.config, reviewer, {
    ideaSlug: ctx.slug,
    ideaRoot: ctx.paths.root,
    workspaceRoot: ctx.paths.workspaceDir,
    runLogPath: ctx.runLogPath,
    extras: { taskId: task.id, round: task.reviewRound + 1 },
  });

  return applyReviewerOutcome(planPath, plan, task, result);
}

function applyReviewerOutcome(
  planPath: string,
  plan: ReturnType<typeof parsePlan>,
  task: PlanTask,
  result: AgentResult,
): number {
  if (result.stopReason.kind === "approved") {
    task.status = transition(task.status, "done");
    writeFileSync(planPath, writePlan(plan));
    process.stdout.write(`\nreviewer approved ${task.id}. status -> done\n`);
    return 0;
  }
  if (result.stopReason.kind === "needs_rework") {
    task.status = transition(task.status, "needs_rework");
    task.reviewRound = task.reviewRound + 1;
    writeFileSync(planPath, writePlan(plan));
    process.stdout.write(
      `\nreviewer requested rework on ${task.id}. status -> needs_rework, review_round=${task.reviewRound}\n`,
    );
    return 0;
  }
  process.stderr.write(
    `\nreviewer did not approve or request rework: ${stopReasonLabel(result.stopReason)}\n`,
  );
  return 1;
}

function collectDiff(workspaceDir: string): string {
  if (!isRepo(workspaceDir)) {
    return "(workspace is not a git repo; reviewer will see this and may need to be re-run after planner bootstraps git)";
  }
  const staged = diffStaged(workspaceDir);
  if (staged.trim()) return staged;
  return diffUnstaged(workspaceDir);
}

interface IdeaContext {
  slug: string;
  paths: ProvisionPaths;
  config: Config;
  runLogPath: string;
}

async function loadIdeaContext(
  slug: string | undefined,
  cmdName: string,
  agentName: string,
): Promise<IdeaContext | null> {
  if (!slug) {
    process.stderr.write(`error: airelay ${cmdName} requires an idea slug\n`);
    return null;
  }
  const paths = ideaPaths(IDEAS_BASE_DIR, slug);
  if (!existsSync(paths.root)) {
    process.stderr.write(`error: idea not found: ${paths.root}\n`);
    return null;
  }

  let config: Config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      process.stderr.write(`error: ${err.message}\n`);
      return null;
    }
    throw err;
  }

  const runLogPath = join(paths.runsDir, `${timestamp()}-${agentName}.log`);
  process.stdout.write(`running ${agentName} for "${slug}" with model ${config.model.id}\n`);
  process.stdout.write(`run log: ${runLogPath}\n`);
  return { slug, paths, config, runLogPath };
}

async function runWithProgress(
  config: Config,
  agent: AgentDefinition,
  context: Parameters<typeof runAgent>[0]["context"],
): Promise<AgentResult> {
  const result = await runAgent({
    config,
    agent,
    context,
    onTurn: (info) => {
      const tools = info.toolCalls.map((t) => t.name).join(", ");
      process.stdout.write(
        `turn ${info.turn}: in=${info.inputTokens} out=${info.outputTokens}` +
          (tools ? ` tools=[${tools}]` : "") +
          "\n",
      );
    },
  });
  process.stdout.write(
    `\nstopped: ${stopReasonLabel(result.stopReason)} ` +
      `(turns=${result.turns}, in=${result.totalInputTokens}, out=${result.totalOutputTokens})\n`,
  );
  return result;
}

function stopReasonLabel(r: StopReason): string {
  switch (r.kind) {
    case "task_complete":
    case "context_limit":
    case "blocked":
    case "approved":
    case "needs_rework":
      return r.note ? `${r.kind} (${r.note})` : r.kind;
    case "turn_cap":
      return `turn_cap (${r.turns} turns)`;
    case "model_stop":
      return `model_stop (${r.reason})`;
    default: {
      const _exhaustive: never = r;
      return String(_exhaustive);
    }
  }
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

void main();
