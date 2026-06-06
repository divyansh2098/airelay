export interface AITool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export type AIMessageParam =
  | { role: "user" | "assistant"; content: string | AIContentBlockParam[] }
  | { role: "tool"; content: AIContentBlockParam[] };

export type AIContentBlockParam =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

export interface AIMessage {
  id: string;
  type: "message";
  role: "assistant";
  content: Array<
    | { type: "text"; text: string }
    | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  >;
  stop_reason: "end_turn" | "max_tokens" | "stop_sequence" | "tool_use" | "other";
  model: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}
