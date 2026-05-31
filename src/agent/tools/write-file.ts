import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Tool } from "../types.js";
import { createSandbox } from "../sandbox.js";

export const writeFileTool: Tool = {
  definition: {
    name: "write_file",
    description:
      "Overwrite (or create) a UTF-8 text file. Parent directories are created if needed. Path is relative to the idea root.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path relative to the idea root.",
        },
        content: {
          type: "string",
          description: "Full file contents to write.",
        },
      },
      required: ["path", "content"],
    },
  },
  handler: (input, ctx) => {
    const sandbox = createSandbox(ctx.ideaRoot);
    const path = sandbox.resolvePath(String(input.path));
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, String(input.content));
    return { output: `wrote ${input.path} (${String(input.content).length} bytes)` };
  },
};
