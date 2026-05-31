import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ValidatedIdea } from "../validator/idea.js";

export class ProvisionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProvisionError";
  }
}

export interface ProvisionPaths {
  root: string;
  ideaFile: string;
  planFile: string;
  reviewFile: string;
  journalFile: string;
  checksDir: string;
  workspaceDir: string;
  runsDir: string;
}

export function ideaPaths(baseDir: string, slug: string): ProvisionPaths {
  const root = join(baseDir, slug);
  return {
    root,
    ideaFile: join(root, "IDEA.md"),
    planFile: join(root, "PLAN.md"),
    reviewFile: join(root, "REVIEW.md"),
    journalFile: join(root, "JOURNAL.md"),
    checksDir: join(root, "checks"),
    workspaceDir: join(root, "workspace"),
    runsDir: join(root, "runs"),
  };
}

export function provisionIdea(
  baseDir: string,
  idea: ValidatedIdea,
): ProvisionPaths {
  const paths = ideaPaths(baseDir, idea.frontmatter.slug);

  if (existsSync(paths.root)) {
    throw new ProvisionError(
      `idea directory already exists: ${paths.root}\nUse \`airelay run ${idea.frontmatter.slug}\` to continue an existing idea.`,
    );
  }

  mkdirSync(paths.root, { recursive: true });
  mkdirSync(paths.checksDir);
  mkdirSync(paths.workspaceDir);
  mkdirSync(paths.runsDir);

  writeFileSync(paths.ideaFile, idea.raw);
  writeFileSync(paths.planFile, "");
  writeFileSync(paths.reviewFile, "");
  writeFileSync(paths.journalFile, "");

  return paths;
}

export function readIdeaFile(path: string): string {
  return readFileSync(path, "utf8");
}
