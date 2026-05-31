import matter from "gray-matter";

export interface IdeaFrontmatter {
  slug: string;
}

export interface ValidatedIdea {
  frontmatter: IdeaFrontmatter;
  body: string;
  raw: string;
}

export class IdeaValidationError extends Error {
  readonly issues: string[];
  constructor(issues: string[]) {
    super(`IDEA.md validation failed:\n  - ${issues.join("\n  - ")}`);
    this.name = "IdeaValidationError";
    this.issues = issues;
  }
}

const REQUIRED_SECTIONS = [
  "One-liner",
  "Why",
  "Core capabilities",
  "Out of scope",
] as const;

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export function validateIdea(raw: string): ValidatedIdea {
  const issues: string[] = [];

  const parsed = matter(raw);
  const fm = parsed.data as Partial<IdeaFrontmatter>;

  if (!fm.slug || typeof fm.slug !== "string") {
    issues.push("frontmatter is missing required field `slug`");
  } else if (!SLUG_PATTERN.test(fm.slug)) {
    issues.push(
      `frontmatter \`slug\` must match ${SLUG_PATTERN} (lowercase letters, digits, hyphens; cannot start with hyphen); got "${fm.slug}"`,
    );
  }

  const sections = extractSections(parsed.content);
  for (const name of REQUIRED_SECTIONS) {
    const content = sections.get(name.toLowerCase());
    if (content === undefined) {
      issues.push(`section "# ${name}" is missing`);
    } else if (!hasMeaningfulContent(content)) {
      issues.push(`section "# ${name}" is empty`);
    }
  }

  if (issues.length > 0) {
    throw new IdeaValidationError(issues);
  }

  return {
    frontmatter: { slug: fm.slug! },
    body: parsed.content,
    raw,
  };
}

function extractSections(body: string): Map<string, string> {
  const sections = new Map<string, string>();
  const headingRe = /^#\s+(.+?)\s*$/gm;
  const matches = [...body.matchAll(headingRe)];

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const name = m[1].trim().toLowerCase();
    const start = m.index! + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index! : body.length;
    sections.set(name, body.slice(start, end));
  }

  return sections;
}

function hasMeaningfulContent(section: string): boolean {
  const withoutComments = section.replace(/<!--[\s\S]*?-->/g, "");
  return withoutComments.trim().length > 0;
}
