import { spawn } from "node:child_process";
import { Tool, ToolContext, ToolResult } from "../types.js";
import { createSandbox } from "../sandbox.js";

export const runBashTool: Tool = {
  definition: {
    name: "run_bash",
    description:
      "Run a bash command. Default cwd is the workspace directory. You can override cwd to any path under the idea root (relative to the idea root). Output is truncated to 20000 chars per stream. Times out after the configured limit.",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string", description: "Bash command to run." },
        cwd: {
          type: "string",
          description:
            "Optional working directory, relative to the idea root. Defaults to 'workspace'. Must resolve inside the idea root.",
        },
      },
      required: ["command"],
    },
  },
  handler: async (input, ctx) => {
    const command = String(input.command);
    const cwdRelative = input.cwd ? String(input.cwd) : "workspace";
    const sandbox = createSandbox(ctx.ideaRoot);
    let cwd: string;
    try {
      cwd = sandbox.resolvePath(cwdRelative);
    } catch (err) {
      return { output: `error: ${(err as Error).message}`, isError: true };
    }
    return runCommand(command, cwd, ctx);
  },
};

const MAX_STREAM_CHARS = 20_000;

function runCommand(command: string, cwd: string, ctx: ToolContext): Promise<ToolResult> {
  return new Promise((resolve) => {
    ctx.appendRunLog(`$ ${command}\n  cwd=${cwd}`);
    const child = spawn("bash", ["-c", command], {
      cwd,
      env: process.env,
    });

    let stdout = "";
    let stderr = "";
    let stdoutTruncated = false;
    let stderrTruncated = false;

    child.stdout.on("data", (chunk: Buffer) => {
      const s = chunk.toString("utf8");
      if (stdout.length + s.length <= MAX_STREAM_CHARS) {
        stdout += s;
      } else if (!stdoutTruncated) {
        stdout += s.slice(0, MAX_STREAM_CHARS - stdout.length);
        stdoutTruncated = true;
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      const s = chunk.toString("utf8");
      if (stderr.length + s.length <= MAX_STREAM_CHARS) {
        stderr += s;
      } else if (!stderrTruncated) {
        stderr += s.slice(0, MAX_STREAM_CHARS - stderr.length);
        stderrTruncated = true;
      }
    });

    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 2000).unref();
    }, ctx.bashTimeoutMs);

    child.on("close", (code, signal) => {
      clearTimeout(timeout);
      const parts: string[] = [];
      parts.push(`exit_code: ${code ?? `(signal: ${signal})`}`);
      if (stdout) parts.push(`stdout:\n${stdout}${stdoutTruncated ? "\n... [truncated]" : ""}`);
      if (stderr) parts.push(`stderr:\n${stderr}${stderrTruncated ? "\n... [truncated]" : ""}`);
      const output = parts.join("\n");
      ctx.appendRunLog(output);
      resolve({ output, isError: code !== 0 });
    });

    child.on("error", (err) => {
      clearTimeout(timeout);
      const msg = `error: failed to spawn: ${err.message}`;
      ctx.appendRunLog(msg);
      resolve({ output: msg, isError: true });
    });
  });
}
