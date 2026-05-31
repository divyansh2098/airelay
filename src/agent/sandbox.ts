import { resolve, relative, isAbsolute } from "node:path";

export class SandboxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SandboxError";
  }
}

export interface Sandbox {
  root: string;
  resolvePath: (input: string) => string;
}

export function createSandbox(root: string): Sandbox {
  const absRoot = resolve(root);
  return {
    root: absRoot,
    resolvePath: (input: string) => resolveSandboxed(absRoot, input),
  };
}

function resolveSandboxed(root: string, input: string): string {
  if (typeof input !== "string" || input.length === 0) {
    throw new SandboxError("path must be a non-empty string");
  }
  if (isAbsolute(input)) {
    throw new SandboxError(
      `absolute paths are not allowed (sandbox root is ${root}); got "${input}"`,
    );
  }
  const resolved = resolve(root, input);
  const rel = relative(root, resolved);
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
    throw new SandboxError(
      `path "${input}" escapes sandbox root ${root} (resolved to ${resolved})`,
    );
  }
  return resolved;
}
