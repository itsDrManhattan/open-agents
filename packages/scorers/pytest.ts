import { shellScorer } from "./shell";
import type { Scorer } from "./types";

export interface PytestScorerConfig {
  /** Directory or file path (e.g. "tests/test_foo.py") */
  target?: string;
  /** Specific test id (e.g. "tests/test_foo.py::test_bar") */
  testId?: string;
  /** Working directory for the pytest invocation */
  cwd?: string;
  /** Extra args passed after the target */
  extraArgs?: string[];
  /** Hard timeout in ms (default 5 min) */
  timeoutMs?: number;
}

/**
 * Convenience wrapper around shellScorer for pytest test suites.
 * Returns pass iff pytest exits 0.
 */
export function pytestScorer(config: PytestScorerConfig = {}): Scorer {
  const target = config.testId ?? config.target ?? "";
  const extraArgs = (config.extraArgs ?? []).join(" ");
  const command = `pytest -q ${target} ${extraArgs}`.replace(/\s+/g, " ").trim();
  const name = `pytest:${target || "<all>"}`;

  const inner = shellScorer({
    command,
    cwd: config.cwd,
    timeoutMs: config.timeoutMs ?? 300_000,
    name,
  });

  return inner;
}
