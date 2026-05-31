import { spawnSync } from "node:child_process";

export class GitError extends Error {
  readonly stderr: string;
  readonly exitCode: number;
  constructor(args: string[], exitCode: number, stderr: string) {
    super(`git ${args.join(" ")} exited ${exitCode}: ${stderr.trim()}`);
    this.name = "GitError";
    this.stderr = stderr;
    this.exitCode = exitCode;
  }
}

function run(cwd: string, args: string[]): string {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new GitError(args, result.status ?? -1, result.stderr ?? "");
  }
  return result.stdout;
}

export function initWorkspace(workspacePath: string): void {
  run(workspacePath, ["init", "-q"]);
}

export function isRepo(workspacePath: string): boolean {
  const result = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], {
    cwd: workspacePath,
    encoding: "utf8",
  });
  return result.status === 0 && result.stdout.trim() === "true";
}

export function stageAll(workspacePath: string): void {
  run(workspacePath, ["add", "-A"]);
}

export function commit(workspacePath: string, message: string): void {
  run(workspacePath, ["commit", "-m", message]);
}

export function diffStaged(workspacePath: string): string {
  return run(workspacePath, ["diff", "--cached"]);
}

export function diffUnstaged(workspacePath: string): string {
  return run(workspacePath, ["diff"]);
}

export function hasStagedChanges(workspacePath: string): boolean {
  const result = spawnSync("git", ["diff", "--cached", "--quiet"], {
    cwd: workspacePath,
    encoding: "utf8",
  });
  return result.status === 1;
}
