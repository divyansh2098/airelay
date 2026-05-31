import { test } from "node:test";
import assert from "node:assert/strict";
import { validateIdea, IdeaValidationError } from "../src/validator/idea.js";

const VALID = `---
slug: my-idea
---

# One-liner
A CLI that does a thing.

# Why
We need it.

# Core capabilities
- Do thing A
- Do thing B

# Out of scope
- Not thing C
`;

test("validateIdea accepts a fully-filled idea", () => {
  const result = validateIdea(VALID);
  assert.equal(result.frontmatter.slug, "my-idea");
});

test("validateIdea rejects missing slug", () => {
  const raw = VALID.replace("slug: my-idea", "");
  assert.throws(() => validateIdea(raw), (err: unknown) => {
    return err instanceof IdeaValidationError && err.issues.some((i) => i.includes("slug"));
  });
});

test("validateIdea rejects bad slug format", () => {
  const raw = VALID.replace("slug: my-idea", "slug: My_Idea");
  assert.throws(() => validateIdea(raw), (err: unknown) => {
    return err instanceof IdeaValidationError && err.issues.some((i) => i.includes("slug"));
  });
});

test("validateIdea rejects missing required section", () => {
  const raw = VALID.replace(/# Why\n[\s\S]*?(?=\n# )/, "");
  assert.throws(() => validateIdea(raw), (err: unknown) => {
    return err instanceof IdeaValidationError && err.issues.some((i) => i.includes("Why") && i.includes("missing"));
  });
});

test("validateIdea rejects empty required section", () => {
  const raw = VALID.replace("A CLI that does a thing.", "");
  assert.throws(() => validateIdea(raw), (err: unknown) => {
    return err instanceof IdeaValidationError && err.issues.some((i) => i.includes("One-liner") && i.includes("empty"));
  });
});

test("validateIdea treats HTML-comment-only section as empty", () => {
  const raw = VALID.replace("A CLI that does a thing.", "<!-- TODO -->");
  assert.throws(() => validateIdea(raw), (err: unknown) => {
    return err instanceof IdeaValidationError && err.issues.some((i) => i.includes("One-liner") && i.includes("empty"));
  });
});

test("validateIdea reports multiple issues at once", () => {
  const raw = `---
slug: ok
---
# One-liner
hi
`;
  try {
    validateIdea(raw);
    assert.fail("should have thrown");
  } catch (err) {
    assert.ok(err instanceof IdeaValidationError);
    assert.ok(err.issues.length >= 3);
  }
});
