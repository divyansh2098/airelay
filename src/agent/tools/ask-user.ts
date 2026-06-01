import { createInterface } from "node:readline";
import { Tool } from "../types.js";

export const askUserTool: Tool = {
  definition: {
    name: "ask_user",
    description:
      "Ask the human a question and wait for a reply. Use sparingly: only for decisions that require human input (stack choices, hard constraints, ambiguity in the idea). Do not use for confirmations of mechanical work.",
    inputSchema: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description: "The question to ask. Be specific. If you have a recommendation, state it.",
        },
      },
      required: ["question"],
    },
  },
  handler: async (input) => {
    const question = String(input.question);
    process.stdout.write("\n--- agent question ---\n");
    process.stdout.write(question + "\n");
    process.stdout.write("--- your reply (end with a single line containing only a period) ---\n");
    const answer = await readMultiline();
    return { output: answer };
  },
};

function readMultiline(): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });
    const lines: string[] = [];
    rl.on("line", (line) => {
      if (line.trim() === ".") {
        rl.close();
        return;
      }
      lines.push(line);
    });
    rl.on("close", () => {
      resolve(lines.join("\n").trim() || "(no reply)");
    });
  });
}
