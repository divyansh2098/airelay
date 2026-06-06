import { exec } from "node:child_process";
import { promisify } from "node:util";
import { AIMessage, AIMessageParam, AITool } from "./ai-types.js";

const execAsync = promisify(exec);

export interface AIClient {
  chat(
    model: string,
    systemPrompt: string,
    tools: AITool[],
    messages: AIMessageParam[],
  ): Promise<AIMessage>;
}

export class GeminiCliClient implements AIClient {
  async chat(
    model: string,
    systemPrompt: string,
    tools: AITool[],
    messages: AIMessageParam[],
  ): Promise<AIMessage> {
    const args = [
      "chat",
      "--model", model,
      "--system-prompt", systemPrompt,
      "--tools", JSON.stringify(tools),
      "--messages", JSON.stringify(messages),
    ];

    // Shell escaping for the arguments
    const escapedArgs = args.map(arg => `'${arg.replace(/'/g, "'\\''")}'`).join(" ");
    const command = `gemini ${escapedArgs}`;

    const { stdout, stderr } = await execAsync(command);

    if (stderr && !stdout) {
      throw new Error(`Gemini CLI error: ${stderr}`);
    }

    try {
      return JSON.parse(stdout) as AIMessage;
    } catch (err) {
      throw new Error(`Failed to parse Gemini CLI output: ${(err as Error).message}\nOutput: ${stdout}`);
    }
  }
}

// Claude CLI client
export class ClaudeCliClient implements AIClient {
  async chat(
    model: string,
    systemPrompt: string,
    tools: AITool[],
    messages: AIMessageParam[],
  ): Promise<AIMessage> {
    const args = [
      "chat",
      "--model", model,
      "--system-prompt", systemPrompt,
      "--tools", JSON.stringify(tools),
      "--messages", JSON.stringify(messages),
    ];

    // Shell escaping for the arguments
    const escapedArgs = args.map(arg => `'${arg.replace(/'/g, "'\\''")}'`).join(" ");
    const command = `claude ${escapedArgs}`;

    const { stdout, stderr } = await execAsync(command);

    if (stderr && !stdout) {
      throw new Error(`Claude CLI error: ${stderr}`);
    }

    try {
      return JSON.parse(stdout) as AIMessage;
    } catch (err) {
      throw new Error(`Failed to parse Claude CLI output: ${(err as Error).message}\nOutput: ${stdout}`);
    }
  }
}

export function createAIClient(backend: string): AIClient {
  switch (backend) {
    case "gemini-cli":
      return new GeminiCliClient();
    case "claude-cli":
      return new ClaudeCliClient();
    default:
      throw new Error(`Unknown AI backend: ${backend}`);
  }
}
