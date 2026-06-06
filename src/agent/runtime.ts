import { appendFileSync } from "node:fs";
import { Config } from "../config/config.js";
import {
  AgentDefinition,
  AgentContext,
  AgentResult,
  Tool,
  ToolContext,
  StopReason,
} from "./types.js";
import { buildDoneTool, DoneSlot, DoneSignal } from "./tools/done.js";
import {
  createContextWatcher,
  WRAP_UP_MESSAGE,
} from "./context-watcher.js";
import { AIMessage, AIMessageParam, AITool, AIContentBlockParam } from "./ai-types.js";
import { createAIClient } from "./ai-client.js";

export interface RuntimeOptions {
  config: Config;
  agent: AgentDefinition;
  context: AgentContext;
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

  const client = createAIClient(config.backend);

  const doneSlot: DoneSlot = { signal: null };
  const tools: Tool[] = [
    ...agent.tools,
    buildDoneTool(doneSlot, agent.allowedDoneReasons),
  ];
  const toolByName = new Map<string, Tool>(tools.map((t) => [t.definition.name, t]));
  const aiTools: AITool[] = tools.map((t) => ({
    name: t.definition.name,
    description: t.definition.description,
    input_schema: t.definition.inputSchema as AITool["input_schema"],
  }));

  const watcher = createContextWatcher({
    contextWindow: config.model.contextWindow,
    threshold: config.contextThreshold,
  });

  const toolContext = buildToolContext(context, config);
  const initialUser = await agent.buildInitialUserMessage(context);
  const messages: AIMessageParam[] = [{ role: "user", content: initialUser }];

  let totalIn = 0;
  let totalOut = 0;
  let turn = 0;

  while (turn < config.maxAgentTurns) {
    turn++;

    const response = await client.chat(
      config.model.id,
      agent.systemPrompt,
      aiTools,
      messages,
    );

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

    const toolResults: AIContentBlockParam[] = [];
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

function collectToolCalls(response: AIMessage): Array<{ id: string; name: string; input: Record<string, unknown> }> {
  const calls: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];
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

function doneSignalToStopReason(signal: DoneSignal): StopReason {
  return { kind: signal.reason, note: signal.note };
}
