import type {
  AgentAdapter,
  AgentRunContext,
  AgentRunResult,
} from "@open-harness/adapters";
import type { Sandbox, SandboxState } from "@open-harness/sandbox";
import type { ScoreResult } from "@open-harness/scorers";
import { z } from "zod";

/**
 * Declarative scorer spec — what goes in a benchmark file.
 * Factory turns these into Scorer instances at runtime.
 */
export const scorerSpecSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("shell"),
    command: z.string(),
    cwd: z.string().optional(),
    timeoutMs: z.number().int().positive().optional(),
    passOnExitCodes: z.array(z.number().int()).optional(),
  }),
  z.object({
    type: z.literal("pytest"),
    target: z.string().optional(),
    testId: z.string().optional(),
    cwd: z.string().optional(),
    timeoutMs: z.number().int().positive().optional(),
  }),
  z.object({
    type: z.literal("file-exists"),
    path: z.string(),
  }),
  z.object({
    type: z.literal("llm-judge"),
    rubric: z.string(),
    evidenceFiles: z.array(z.string()).optional(),
    includeGitDiff: z.boolean().optional(),
  }),
]);

/**
 * How to prepare the sandbox before the agent runs.
 * Either clone a repo, seed inline files, or both.
 */
export const setupSpecSchema = z.object({
  repo: z.string().optional(),
  commit: z.string().optional(),
  branch: z.string().optional(),
  /** Inline files: { "src/foo.ts": "contents..." } */
  files: z.record(z.string(), z.string()).optional(),
  /** Commands to run after clone/seed, before the agent starts */
  setupCommands: z.array(z.string()).optional(),
});

export const taskDefSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  setup: setupSpecSchema.optional(),
  scorers: z.array(scorerSpecSchema).min(1),
  timeoutMs: z.number().int().positive().optional(),
  tags: z.array(z.string()).optional(),
});

export const benchmarkDefSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  version: z.string().optional(),
  defaultTimeoutMs: z.number().int().positive().optional(),
  tasks: z.array(taskDefSchema).min(1),
});

export type ScorerSpec = z.infer<typeof scorerSpecSchema>;
export type SetupSpec = z.infer<typeof setupSpecSchema>;
export type TaskDef = z.infer<typeof taskDefSchema>;
export type BenchmarkDef = z.infer<typeof benchmarkDefSchema>;

/**
 * Outcome of running one task through one adapter.
 */
export interface TaskResult {
  taskId: string;
  adapter: string;
  /** AND of all scorer passes */
  pass: boolean;
  /** Mean of scorer scores (0..1) */
  aggregateScore: number;
  scores: ScoreResult[];
  agent: AgentRunResult;
  startedAt: number;
  finishedAt: number;
  durationMs: number;
  /** Populated if setup or teardown itself crashed */
  error?: string;
}

/**
 * Aggregated result of a full benchmark run.
 */
export interface BenchmarkRunResult {
  benchmarkId: string;
  adapter: string;
  startedAt: number;
  finishedAt: number;
  durationMs: number;
  passRate: number;
  totalTokens: {
    input: number;
    output: number;
    cachedInput: number;
  };
  tasks: TaskResult[];
}

/**
 * Produces a ready-to-use sandbox for one task.
 * The runner owns teardown via sandbox.stop().
 */
export type SandboxFactory = () => Promise<{
  sandbox: Sandbox;
  state: SandboxState;
}>;

export type { AgentAdapter, AgentRunContext, AgentRunResult };
