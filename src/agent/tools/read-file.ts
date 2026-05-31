import { readFileSync, statSync } from "node:fs";
import { Tool } from "../types.js";
import { createSandbox } from "../sandbox.js";

export const readFileTool: Tool = {
  definition: {
    name: "read_file",
    description:
      "Read a UTF-8 text file. Path is relative to the idea root (where PLAN.md, JOURNAL.md, REVIEW.md, checks/, workspace/ live).",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path relative to the idea root, e.g. 'PLAN.md' or 'workspace/src/index.ts'",
        },
      },
      required: ["path"],
    },
  },
  handler: (input, ctx) => {
    const sandbox = createSandbox(ctx.ideaRoot);
    const path = sandbox.resolvePath(String(input.path));
    const stat = statSync(path);
    if (stat.isDirectory()) {
      return { output: `error: "${input.path}" is a directory, not a file`, isError: true };
    }
    const contents = readFileSync(path, "utf8");
    return { output: contents };
  },
};
