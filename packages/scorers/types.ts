import type { Sandbox } from "@open-harness/sandbox";

/**
 * Context given to a scorer after the agent-under-test has finished.
 * Scorers inspect the sandbox's final state to decide pass/fail.
 */
export interface ScoreContext {
  /** Sandbox in its post-agent-run state */
  sandbox: Sandbox;
  /** Original task prompt — scorers may reference it (e.g. LLM judge) */
  taskPrompt: string;
  /** Working directory (defaults to sandbox.workingDirectory) */
  cwd?: string;
  /** Cancellation signal */
  signal?: AbortSignal;
}

/**
 * Verdict produced by a scorer.
 * A task's overall pass is the AND of every scorer's `pass`.
 */
export interface ScoreResult {
  /** Binary pass/fail verdict */
  pass: boolean;
  /** Normalized score 0..1 — for binary scorers this is 1 or 0 */
  score: number;
  /** Name of the scorer that produced this result */
  scorer: string;
  /** Human-readable summary */
  message?: string;
  /** Raw evidence (stdout, LLM reasoning, diffs, etc.) */
  evidence?: Record<string, unknown>;
}

/**
 * A scorer decides whether a completed task satisfies its rubric.
 * Scorers are cheap to construct — they're plain functions with a name.
 */
export interface Scorer {
  readonly name: string;
  score(ctx: ScoreContext): Promise<ScoreResult>;
}
