export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ToolContext {
  workspaceRoot: string;
  ideaRoot: string;
  runLogPath: string;
  appendRunLog: (line: string) => void;
  bashTimeoutMs: number;
}

export interface ToolResult {
  output: string;
  isError?: boolean;
}

export type ToolHandler = (
  input: Record<string, unknown>,
  context: ToolContext,
) => Promise<ToolResult> | ToolResult;

export interface Tool {
  definition: ToolDefinition;
  handler: ToolHandler;
}

export type DoneReason =
  | "task_complete"
  | "context_limit"
  | "blocked"
  | "approved"
  | "needs_rework";

export interface AgentDefinition {
  name: string;
  systemPrompt: string;
  tools: Tool[];
  allowedDoneReasons: readonly DoneReason[];
  buildInitialUserMessage: (context: AgentContext) => Promise<string> | string;
}

export interface AgentContext {
  ideaSlug: string;
  ideaRoot: string;
  workspaceRoot: string;
  runLogPath: string;
  extras?: Record<string, unknown>;
}

export type StopReason =
  | { kind: "task_complete"; note?: string }
  | { kind: "context_limit"; note?: string }
  | { kind: "blocked"; note?: string }
  | { kind: "approved"; note?: string }
  | { kind: "needs_rework"; note?: string }
  | { kind: "turn_cap"; turns: number }
  | { kind: "model_stop"; reason: string };

export interface AgentResult {
  stopReason: StopReason;
  turns: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}
