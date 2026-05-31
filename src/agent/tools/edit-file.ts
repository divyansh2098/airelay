import { readFileSync, writeFileSync } from "node:fs";
import { Tool } from "../types.js";
import { createSandbox } from "../sandbox.js";

export const editFileTool: Tool = {
  definition: {
    name: "edit_file",
    description:
      "Replace exact occurrences of `old_string` with `new_string` in a UTF-8 file. By default `old_string` must appear exactly once; set `replace_all: true` to replace every occurrence. Path is relative to the idea root.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path relative to the idea root." },
        old_string: { type: "string", description: "Exact text to replace. Include enough surrounding context to be unique unless replace_all is true." },
        new_string: { type: "string", description: "Replacement text." },
        replace_all: { type: "boolean", description: "If true, replace every occurrence. Default false." },
      },
      required: ["path", "old_string", "new_string"],
    },
  },
  handler: (input, ctx) => {
    const sandbox = createSandbox(ctx.ideaRoot);
    const path = sandbox.resolvePath(String(input.path));
    const oldStr = String(input.old_string);
    const newStr = String(input.new_string);
    const replaceAll = Boolean(input.replace_all);

    if (oldStr === "") {
      return { output: "error: old_string must not be empty", isError: true };
    }

    const original = readFileSync(path, "utf8");
    const occurrences = countOccurrences(original, oldStr);
    if (occurrences === 0) {
      return { output: `error: old_string not found in ${input.path}`, isError: true };
    }
    if (occurrences > 1 && !replaceAll) {
      return {
        output: `error: old_string appears ${occurrences} times in ${input.path}; provide more context to make it unique, or set replace_all: true`,
        isError: true,
      };
    }

    const updated = replaceAll
      ? original.split(oldStr).join(newStr)
      : original.replace(oldStr, newStr);
    writeFileSync(path, updated);
    return { output: `edited ${input.path} (${occurrences} replacement${occurrences === 1 ? "" : "s"})` };
  },
};

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let i = 0;
  while (true) {
    const found = haystack.indexOf(needle, i);
    if (found === -1) break;
    count++;
    i = found + needle.length;
  }
  return count;
}
