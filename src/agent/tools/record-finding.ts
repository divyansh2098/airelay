import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { Tool } from "../types.js";

export interface ReviewSlot {
  taskId: string;
  round: number;
  reviewFilePath: string;
}

export type FindingSeverity = "blocker" | "concern" | "nit";

export function buildRecordFindingTool(slot: ReviewSlot): Tool {
  return {
    definition: {
      name: "record_finding",
      description:
        "Record a single review finding for the current task. Append-only; call once per finding. " +
        "Severity: 'blocker' = must fix before approval; 'concern' = should fix unless there's a reason not to; 'nit' = minor, optional.",
      inputSchema: {
        type: "object",
        properties: {
          severity: { type: "string", enum: ["blocker", "concern", "nit"] },
          summary: { type: "string", description: "One-line summary of the issue." },
          detail: { type: "string", description: "Optional longer explanation, including file references and suggested fix." },
        },
        required: ["severity", "summary"],
      },
    },
    handler: (input) => {
      const severity = String(input.severity) as FindingSeverity;
      if (!["blocker", "concern", "nit"].includes(severity)) {
        return { output: `error: invalid severity "${severity}"`, isError: true };
      }
      const summary = String(input.summary).trim();
      if (!summary) {
        return { output: "error: summary is required", isError: true };
      }
      const detail = input.detail !== undefined ? String(input.detail).trim() : undefined;

      appendFinding(slot, severity, summary, detail);
      return { output: `recorded: [${severity}] ${summary}` };
    },
  };
}

function appendFinding(
  slot: ReviewSlot,
  severity: FindingSeverity,
  summary: string,
  detail: string | undefined,
): void {
  const header = `### ${slot.taskId} round ${slot.round}`;
  const existing = existsSync(slot.reviewFilePath)
    ? readFileSync(slot.reviewFilePath, "utf8")
    : "";

  const bullet = formatBullet(severity, summary, detail);

  let next: string;
  if (existing.includes(header)) {
    next = appendUnderHeader(existing, header, bullet);
  } else {
    next = ensureTrailingNewline(existing) + `\n${header}\n\n${bullet}\n`;
  }
  writeFileSync(slot.reviewFilePath, next);
}

function formatBullet(severity: FindingSeverity, summary: string, detail: string | undefined): string {
  const head = `- **[${severity}]** ${summary}`;
  if (!detail) return head;
  const indented = detail
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");
  return `${head}\n${indented}`;
}

function appendUnderHeader(existing: string, header: string, bullet: string): string {
  const headerIndex = existing.indexOf(header);
  const sectionStart = headerIndex + header.length;

  let nextHeaderIndex = existing.indexOf("\n### ", sectionStart);
  if (nextHeaderIndex === -1) nextHeaderIndex = existing.indexOf("\n## ", sectionStart);
  if (nextHeaderIndex === -1) nextHeaderIndex = existing.length;

  const before = existing.slice(0, nextHeaderIndex).replace(/\s+$/, "");
  const after = existing.slice(nextHeaderIndex);
  return `${before}\n${bullet}\n${after.startsWith("\n") ? after : "\n" + after}`;
}

function ensureTrailingNewline(s: string): string {
  if (s === "") return "";
  return s.endsWith("\n") ? s : s + "\n";
}

export function reviewFilePath(ideaRoot: string): string {
  return join(ideaRoot, "REVIEW.md");
}
