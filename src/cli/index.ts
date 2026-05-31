#!/usr/bin/env node
import { resolve, join } from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { validateIdea, IdeaValidationError } from "../validator/idea.js";
import { IDEA_TEMPLATE } from "../validator/template.js";
import { provisionIdea, ProvisionError, ideaPaths } from "../provision/provision.js";
import { loadConfig, ConfigError } from "../config/config.js";
import { runAgent } from "../agent/runtime.js";
import { implementerAgent } from "../agents/implementer.js";

const IDEAS_BASE_DIR = resolve(process.cwd(), "ideas");

interface CommandHandler {
  (args: string[]): Promise<number> | number;
}

const commands: Record<string, CommandHandler> = {
  new: cmdNew,
  init: cmdInit,
  run: cmdRun,
  review: cmdNotImplemented("review"),
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
      "  airelay run <slug>              Run the implementer until next ready_for_review",
      "  airelay review <slug>           [stub] Run the reviewer over a ready_for_review task",
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

async function cmdRun(args: string[]): Promise<number> {
  const slug = args[0];
  if (!slug) {
    process.stderr.write("error: airelay run requires an idea slug\n");
    return 2;
  }
  const paths = ideaPaths(IDEAS_BASE_DIR, slug);
  if (!existsSync(paths.root)) {
    process.stderr.write(`error: idea not found: ${paths.root}\n`);
    return 2;
  }

  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      process.stderr.write(`error: ${err.message}\n`);
      return 2;
    }
    throw err;
  }

  const runLogPath = join(paths.runsDir, `${timestamp()}-implementer.log`);

  process.stdout.write(`running implementer for "${slug}" with model ${config.model.id}\n`);
  process.stdout.write(`run log: ${runLogPath}\n`);

  const result = await runAgent({
    config,
    agent: implementerAgent,
    context: {
      ideaSlug: slug,
      ideaRoot: paths.root,
      workspaceRoot: paths.workspaceDir,
      runLogPath,
    },
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
  return result.stopReason.kind === "task_complete" ||
    result.stopReason.kind === "context_limit"
    ? 0
    : 1;
}

function stopReasonLabel(r: { kind: string; note?: string; reason?: string; turns?: number }): string {
  switch (r.kind) {
    case "task_complete":
    case "context_limit":
    case "blocked":
      return r.note ? `${r.kind} (${r.note})` : r.kind;
    case "turn_cap":
      return `turn_cap (${r.turns} turns)`;
    case "model_stop":
      return `model_stop (${r.reason})`;
    default:
      return r.kind;
  }
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

void main();
