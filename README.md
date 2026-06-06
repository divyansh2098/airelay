# airelay

Three-agent relay (planner / implementer / reviewer) that builds any idea from a markdown spec, with file-backed state for context-window handoff between sessions.

You write `IDEA.md`. airelay scaffolds a workspace, plans the work, implements it task-by-task, and reviews each task with an independent critic — all driven by LLMs (like Claude or Gemini). When a session runs out of context, it stops cleanly and the next session resumes from the markdown files on disk.

> **Status:** early. The framework, planner, implementer, reviewer agents, and the orchestrator (`airelay loop`) are wired up.

## Why

Most agent harnesses either compact context aggressively (losing fidelity) or assume one long-lived session (which is fragile). airelay does neither: state lives in human-editable markdown files, agents are stateless processes, and the work picks up exactly where it stopped.

## Architecture

Three agents, each a stateless process driven by `AgentDefinition`:

- **Planner** — interactive, one-shot. Reads `IDEA.md`, asks the human clarifying questions via `ask_user`, scaffolds `workspace/`, and writes `PLAN.md`, `checks/preflight.sh`, and a seeded `REVIEW.md`.
- **Implementer** — runs one task at a time from `PLAN.md` until it flips a task to `ready_for_review` or hits the context-window threshold. Logs to `JOURNAL.md` so the next session can pick up.
- **Reviewer** — bound to one task and one diff. Sees `IDEA.md`, the task title, the staged diff, and prior findings — but **not** `PLAN.md` or `JOURNAL.md`, to stay independent. Records each finding in `REVIEW.md`, then approves or requests rework.

Task lifecycle:

```
not_started → in_progress → ready_for_review → done
                                  ↓
                            needs_rework → in_progress
```

Handoff between sessions is by file, not memory:

```
IDEA.md         the user's spec (extended by planner with clarifications)
PLAN.md         ordered task list with status, check script, review_round
JOURNAL.md      implementer's running log of what it did (implementer-only)
REVIEW.md       standing criteria + per-round findings (reviewer-only)
checks/         preflight.sh + optional per-task check scripts
workspace/      the actual project being built (its own git repo)
runs/           per-invocation log files
```

## Install

Requires Node.js >= 20.

```bash
git clone https://github.com/divyansh2098/airelay.git
cd airelay
npm install
npm run build
```

For local use of the CLI:

```bash
npm link            # exposes `airelay` on your PATH
# or run directly:
node dist/cli/index.js <command> ...
```

## Usage

```bash
# 1. Scaffold a starter idea file
airelay init my-idea

# 2. Edit my-idea.md, then validate it and provision ideas/<slug>/
airelay new my-idea.md

# 3. Run the planner (interactive — it will ask you questions)
airelay plan <slug>

# 4. Run the implementer (until a task becomes ready_for_review)
airelay run <slug>

# 5. Run the reviewer over the staged diff
airelay review <slug>

# 6. Run the status command to see the current progress
airelay status <slug>

# 7. Run the loop to auto-alternate run + review until all tasks are done
airelay loop <slug>
```

`airelay help` lists every subcommand.

## Configuration

All config is read from environment variables.

| Variable                       | Default                | Notes                                            |
| ------------------------------ | ---------------------- | ------------------------------------------------ |
| `AIRELAY_BACKEND`             | `gemini-cli`           | AI backend: `gemini-cli` or `claude-cli`.        |
| `AIRELAY_MODEL`                | `claude-sonnet-4-6`    | Must be one of the known model IDs.              |
| `AIRELAY_CONTEXT_THRESHOLD`    | `0.7`                  | Fraction of context window before wrap-up nudge. |
| `AIRELAY_MAX_TURNS`            | `200`                  | Hard turn cap per agent invocation.              |
| `AIRELAY_BASH_TIMEOUT_MS`      | `300000`               | Default `run_bash` timeout (5 min).              |

Note: `airelay` calls out to CLI tools (`gemini` or `claude`) for model interaction. Ensure these tools are in your `PATH` and configured with necessary API keys in their own environment.

## Multi-backend support

`airelay` is designed to be AI-backend agnostic. It does not call APIs directly; instead, it delegates to underlying CLI tools:

- **`gemini-cli`** (default): Uses the `gemini chat` command.
- **`claude-cli`**: Uses the `claude chat` command.

Set `AIRELAY_BACKEND` to switch. Authentication and configuration (including API keys) are handled by the respective CLI tools.

## Idea file format

`IDEA.md` is YAML frontmatter (with `slug:`) plus a fixed set of headed sections. Run `airelay init <path>` to get a template; required sections are `# One-liner`, `# Why`, `# Core capabilities`, and `# Out of scope`. The validator rejects ideas with empty required sections (HTML comments don't count as content).

## Project layout

```
src/
  agent/
    runtime.ts          # the message loop driving the relay
    context-watcher.ts  # warns the agent when context fills
    sandbox.ts          # path containment under ideaRoot
    tools/              # read_file, write_file, edit_file, run_bash, done, ask_user, record_finding
    types.ts            # AgentDefinition, AgentContext, StopReason, ...
  agents/
    planner.ts
    implementer.ts
    reviewer.ts
  cli/
    index.ts            # subcommand dispatch
  config/               # env-var loading
  validator/            # IDEA.md schema + template
  provision/            # creates ideas/<slug>/ scaffold
  plan/                 # PLAN.md parse + write
  state/                # task state machine
  git/                  # diff helpers for the reviewer
test/                   # node --test, all tests run with tsx
```

## Development

```bash
npm run typecheck   # tsc --noEmit
npm test            # node --test against test/*.test.ts
npm run build       # emit dist/
npm run dev         # tsc --watch
```

## Roadmap

- 3-rework-rounds escalation back to a human (Implemented).
- Auto-commit on reviewer approval (Implemented).
- Context-limit respawn (Implemented).
- Support for more models (e.g. GPT-4).
- Parallel task execution for independent branches of the plan.
