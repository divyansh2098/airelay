export interface ModelInfo {
  id: string;
  contextWindow: number;
}

export const MODELS: Record<string, ModelInfo> = {
  "claude-sonnet-4-6": { id: "claude-sonnet-4-6", contextWindow: 200_000 },
  "claude-opus-4-7": { id: "claude-opus-4-7", contextWindow: 200_000 },
  "claude-haiku-4-5-20251001": { id: "claude-haiku-4-5-20251001", contextWindow: 200_000 },
};

export interface Config {
  apiKey: string;
  model: ModelInfo;
  contextThreshold: number;
  maxAgentTurns: number;
  bashTimeoutMs: number;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

const DEFAULT_MODEL_ID = "claude-sonnet-4-6";
const DEFAULT_CONTEXT_THRESHOLD = 0.7;
const DEFAULT_MAX_TURNS = 200;
const DEFAULT_BASH_TIMEOUT_MS = 5 * 60 * 1000;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const apiKey = env.ANTHROPIC_API_KEY ?? "";
  if (!apiKey) {
    throw new ConfigError(
      "ANTHROPIC_API_KEY is not set. Set it in your environment before running an agent.",
    );
  }

  const modelId = env.AIRELAY_MODEL ?? DEFAULT_MODEL_ID;
  const model = MODELS[modelId];
  if (!model) {
    throw new ConfigError(
      `unknown model "${modelId}". Known models: ${Object.keys(MODELS).join(", ")}`,
    );
  }

  const contextThreshold = parseFloatEnv(
    env.AIRELAY_CONTEXT_THRESHOLD,
    DEFAULT_CONTEXT_THRESHOLD,
    "AIRELAY_CONTEXT_THRESHOLD",
  );
  if (contextThreshold <= 0 || contextThreshold >= 1) {
    throw new ConfigError(
      `AIRELAY_CONTEXT_THRESHOLD must be in (0, 1); got ${contextThreshold}`,
    );
  }

  const maxAgentTurns = parseIntEnv(
    env.AIRELAY_MAX_TURNS,
    DEFAULT_MAX_TURNS,
    "AIRELAY_MAX_TURNS",
  );
  if (maxAgentTurns < 1) {
    throw new ConfigError(`AIRELAY_MAX_TURNS must be >= 1; got ${maxAgentTurns}`);
  }

  const bashTimeoutMs = parseIntEnv(
    env.AIRELAY_BASH_TIMEOUT_MS,
    DEFAULT_BASH_TIMEOUT_MS,
    "AIRELAY_BASH_TIMEOUT_MS",
  );
  if (bashTimeoutMs < 1000) {
    throw new ConfigError(`AIRELAY_BASH_TIMEOUT_MS must be >= 1000; got ${bashTimeoutMs}`);
  }

  return { apiKey, model, contextThreshold, maxAgentTurns, bashTimeoutMs };
}

function parseFloatEnv(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    throw new ConfigError(`${name} must be a number; got "${raw}"`);
  }
  return n;
}

function parseIntEnv(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n)) {
    throw new ConfigError(`${name} must be an integer; got "${raw}"`);
  }
  return n;
}
