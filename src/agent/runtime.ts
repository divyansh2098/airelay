import { appendFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import type {
  MessageParam,
  ContentBlockParam,
  Tool as SdkTool,
  ToolUseBlock,
  Message,
} from "@anthropic-ai/sdk/resources/messages.js";
import { Config } from "../config/config.js";
import {
  AgentDefinition,
  AgentContext,
  AgentResult,
  Tool,
  ToolContext,
  StopReason,
} from "./types.js";
import { buildDoneTool, DoneSlot } from "./tools/done.js";
import {
  ContextWatcher,
  createContextWatcher,
  WRAP_UP_MESSAGE,
} from "./context-watcher.js";

export interface RuntimeOptions {
  config: Config;
  agent: AgentDefinition;
  context: AgentContext;
  client?: Anthropic;
  onTurn?: (info: TurnInfo) => void;
}

export interface TurnInfo {
  turn: number;
  inputTokens: number;
  outputTokens: number;
  toolCalls: { name: string; ok: boolean }[];
}

export async function runAgent(opts: RuntimeOptions): Promise<AgentResult> {
  const { config, agent, context } = opts;
  const client = opts.client ?? new Anthropic({ apiKey: config.apiKey });

  const doneSlot: DoneSlot = { signal: null };
  const tools: Tool[] = [...agent.tools, buildDoneTool(doneSlot)];
  const toolByName = new Map<string, Tool>(tools.map((t) => [t.definition.name, t]));
  const sdkTools: SdkTool[] = tools.map((t) => ({
    name: t.definition.name,
    description: t.definition.description,
    input_schema: t.definition.inputSchema as SdkTool["input_schema"],
  }));

  const watcher = createContextWatcher({
    contextWindow: config.model.contextWindow,
    threshold: config.contextThreshold,
  });

  const toolContext = buildToolContext(context, config);
  const initialUser = await agent.buildInitialUserMessage(context);
  const messages: MessageParam[] = [{ role: "user", content: initialUser }];

  let totalIn = 0;
  let totalOut = 0;
  let turn = 0;

  while (turn < config.maxAgentTurns) {
    turn++;

    const response = await client.messages.create({
      model: config.model.id,
      max_tokens: 8192,
      system: agent.systemPrompt,
      tools: sdkTools,
      messages,
    });

    totalIn += response.usage.input_tokens;
    totalOut += response.usage.output_tokens;
    watcher.observe(response.usage.input_tokens);

    const toolCalls = collectToolCalls(response);
    opts.onTurn?.({
      turn,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      toolCalls: toolCalls.map((tc) => ({ name: tc.name, ok: true })),
    });

    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "end_turn" && toolCalls.length === 0) {
      return result({
        kind: "model_stop",
        reason: "end_turn (no tool use)",
      });
    }

    if (toolCalls.length === 0) {
      return result({
        kind: "model_stop",
        reason: response.stop_reason ?? "unknown",
      });
    }

    const toolResults: ContentBlockParam[] = [];
    for (const call of toolCalls) {
      const tool = toolByName.get(call.name);
      if (!tool) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: call.id,
          content: `error: unknown tool "${call.name}"`,
          is_error: true,
        });
        continue;
      }
      try {
        const out = await tool.handler(call.input as Record<string, unknown>, toolContext);
        toolResults.push({
          type: "tool_result",
          tool_use_id: call.id,
          content: out.output,
          is_error: out.isError ?? false,
        });
      } catch (err) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: call.id,
          content: `error: ${(err as Error).message}`,
          is_error: true,
        });
      }
    }

    messages.push({ role: "user", content: toolResults });

    if (doneSlot.signal) {
      return result(doneSignalToStopReason(doneSlot.signal));
    }

    if (watcher.shouldWarn()) {
      messages.push({ role: "user", content: WRAP_UP_MESSAGE });
      watcher.markWarned();
    }
  }

  return result({ kind: "turn_cap", turns: turn });

  function result(stopReason: StopReason): AgentResult {
    return {
      stopReason,
      turns: turn,
      totalInputTokens: totalIn,
      totalOutputTokens: totalOut,
    };
  }
}

function collectToolCalls(response: Message): ToolUseBlock[] {
  const calls: ToolUseBlock[] = [];
  for (const block of response.content) {
    if (block.type === "tool_use") calls.push(block);
  }
  return calls;
}

function buildToolContext(context: AgentContext, config: Config): ToolContext {
  const append = makeRunLogAppender(context.runLogPath);
  return {
    workspaceRoot: context.workspaceRoot,
    ideaRoot: context.ideaRoot,
    runLogPath: context.runLogPath,
    appendRunLog: append,
    bashTimeoutMs: config.bashTimeoutMs,
  };
}

function makeRunLogAppender(path: string): (line: string) => void {
  return (line: string) => {
    const stamp = new Date().toISOString();
    appendFileSync(path, `\n[${stamp}]\n${line}\n`);
  };
}

function doneSignalToStopReason(signal: { reason: string; note?: string }): StopReason {
  switch (signal.reason) {
    case "task_complete":
      return { kind: "task_complete", note: signal.note };
    case "context_limit":
      return { kind: "context_limit", note: signal.note };
    case "blocked":
      return { kind: "blocked", note: signal.note };
    default:
      return { kind: "model_stop", reason: `unknown done reason: ${signal.reason}` };
  }
}
