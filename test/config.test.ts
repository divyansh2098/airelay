import { test } from "node:test";
import assert from "node:assert/strict";
import { loadConfig, ConfigError } from "../src/config/config.js";

test("loadConfig fails when API key missing", () => {
  assert.throws(() => loadConfig({}), ConfigError);
});

test("loadConfig uses defaults when only API key set", () => {
  const cfg = loadConfig({ ANTHROPIC_API_KEY: "sk-test" });
  assert.equal(cfg.apiKey, "sk-test");
  assert.equal(cfg.model.id, "claude-sonnet-4-6");
  assert.equal(cfg.contextThreshold, 0.7);
});

test("loadConfig rejects unknown model", () => {
  assert.throws(
    () => loadConfig({ ANTHROPIC_API_KEY: "x", AIRELAY_MODEL: "gpt-9" }),
    ConfigError,
  );
});

test("loadConfig rejects out-of-range threshold", () => {
  assert.throws(
    () => loadConfig({ ANTHROPIC_API_KEY: "x", AIRELAY_CONTEXT_THRESHOLD: "0" }),
    ConfigError,
  );
  assert.throws(
    () => loadConfig({ ANTHROPIC_API_KEY: "x", AIRELAY_CONTEXT_THRESHOLD: "1" }),
    ConfigError,
  );
});

test("loadConfig rejects non-numeric threshold", () => {
  assert.throws(
    () => loadConfig({ ANTHROPIC_API_KEY: "x", AIRELAY_CONTEXT_THRESHOLD: "abc" }),
    ConfigError,
  );
});

test("loadConfig accepts all overrides", () => {
  const cfg = loadConfig({
    ANTHROPIC_API_KEY: "x",
    AIRELAY_MODEL: "claude-opus-4-7",
    AIRELAY_CONTEXT_THRESHOLD: "0.5",
    AIRELAY_MAX_TURNS: "50",
    AIRELAY_BASH_TIMEOUT_MS: "60000",
  });
  assert.equal(cfg.model.id, "claude-opus-4-7");
  assert.equal(cfg.contextThreshold, 0.5);
  assert.equal(cfg.maxAgentTurns, 50);
  assert.equal(cfg.bashTimeoutMs, 60000);
});
