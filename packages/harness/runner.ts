import type { AgentAdapter } from "@open-harness/adapters";
import type { Sandbox, SandboxState } from "@open-harness/sandbox";
import type { ScoreResult, Scorer } from "@open-harness/scorers";
import type { LanguageModel } from "ai";
import { createScorer } from "./scorer-factory";
import { applySetup } from "./setup";
import type {
  BenchmarkDef,
  BenchmarkRunResult,
  SandboxFactory,
  TaskDef,
  TaskResult,
} from "./types";

export interface RunTaskOptions {
  adapter: AgentAdapter;
  task: TaskDef;
  sandbox: Sandbox;
  sandboxState: SandboxState;
  /** Required when any scorer has type: "llm-judge" */
  judgeModel?: LanguageModel;
  /** Hard override; otherwise task.timeoutMs (or 30 min default) is used */
  timeoutMsOverride?: number;
  signal?: AbortSignal;
}

const DEFAULT_TASK_TIMEOUT = 30 * 60_000;

/**
 * Runs a single task inside a pre-provisioned sandbox.
 * Does NOT spin up or tear down the sandbox — that's the caller's job.
 */
export async function runTask(opts: RunTaskOptions): Promise<TaskResult> {
  const startedAt = Date.now();
  const { adapter, task, sandbox, sandboxState } = opts;
  const timeoutMs =
    opts.timeoutMsOverride ?? task.timeoutMs ?? DEFAULT_TASK_TIMEOUT;

  try {
    // 1. Seed the sandbox
    await applySetup(sandbox, task.setup, { signal: opts.signal });

    // 2. Drive the agent
    const agentResult = await adapter.run({
      sandbox,
      sandboxState,
      taskPrompt: task.prompt,
      timeoutMs,
      signal: opts.signal,
    });

    // 3. Run scorers against the post-run sandbox state
    const scorers: Scorer[] = task.scorers.map((spec) =>
      createScorer(spec, { judgeModel: opts.judgeModel }),
    );
    const scores: ScoreResult[] = [];
    for (const scorer of scorers) {
      try {
        const r = await scorer.score({
          sandbox,
          taskPrompt: task.prompt,
          signal: opts.signal,
        });
        scores.push(r);
      } catch (err) {
        scores.push({
          pass: false,
          score: 0,
          scorer: scorer.name,
          message: `scorer crashed: ${errMsg(err)}`,
          evidence: { error: errMsg(err) },
        });
      }
    }

    const pass = scores.length > 0 && scores.every((s) => s.pass);
    const aggregateScore =
      scores.length > 0
        ? scores.reduce((sum, r) => sum + r.score, 0) / scores.length
        : 0;

    const finishedAt = Date.now();
    return {
      taskId: task.id,
      adapter: adapter.name,
      pass,
      aggregateScore,
      scores,
      agent: agentResult,
      startedAt,
      finishedAt,
      durationMs: finishedAt - startedAt,
    };
  } catch (err) {
    const finishedAt = Date.now();
    return {
      taskId: task.id,
      adapter: adapter.name,
      pass: false,
      aggregateScore: 0,
      scores: [],
      agent: {
        success: false,
        turns: 0,
        durationMs: 0,
        error: errMsg(err),
      },
      startedAt,
      finishedAt,
      durationMs: finishedAt - startedAt,
      error: errMsg(err),
    };
  }
}

export interface RunBenchmarkOptions {
  adapter: AgentAdapter;
  benchmark: BenchmarkDef;
  /** Produces a fresh sandbox per task */
  sandboxFactory: SandboxFactory;
  /** Number of tasks in flight at once (default 4) */
  concurrency?: number;
  /** Required if benchmark uses llm-judge scorers */
  judgeModel?: LanguageModel;
  signal?: AbortSignal;
  /** Fired as each task finishes — use this to stream UI updates */
  onTaskComplete?: (result: TaskResult) => void;
}

/**
 * Runs every task in a benchmark with bounded concurrency.
 * Each task gets its own fresh sandbox; stop() is called no matter what.
 */
export async function runBenchmark(
  opts: RunBenchmarkOptions,
): Promise<BenchmarkRunResult> {
  const startedAt = Date.now();
  const concurrency = Math.max(1, opts.concurrency ?? 4);
  const queue: TaskDef[] = [...opts.benchmark.tasks];
  const results: TaskResult[] = [];

  const worker = async (): Promise<void> => {
    while (!opts.signal?.aborted) {
      const task = queue.shift();
      if (!task) return;

      let sandboxBundle:
        | { sandbox: Sandbox; state: SandboxState }
        | undefined;
      try {
        sandboxBundle = await opts.sandboxFactory();
        const result = await runTask({
          adapter: opts.adapter,
          task,
          sandbox: sandboxBundle.sandbox,
          sandboxState: sandboxBundle.state,
          judgeModel: opts.judgeModel,
          timeoutMsOverride: opts.benchmark.defaultTimeoutMs,
          signal: opts.signal,
        });
        results.push(result);
        opts.onTaskComplete?.(result);
      } catch (err) {
        // Catastrophic failure (e.g., sandbox couldn't be provisioned)
        const now = Date.now();
        const failed: TaskResult = {
          taskId: task.id,
          adapter: opts.adapter.name,
          pass: false,
          aggregateScore: 0,
          scores: [],
          agent: { success: false, turns: 0, durationMs: 0, error: errMsg(err) },
          startedAt: now,
          finishedAt: now,
          durationMs: 0,
          error: `sandbox provisioning failed: ${errMsg(err)}`,
        };
        results.push(failed);
        opts.onTaskComplete?.(failed);
      } finally {
        if (sandboxBundle) {
          try {
            await sandboxBundle.sandbox.stop();
          } catch {
            // teardown failures shouldn't crash the whole run
          }
        }
      }
    }
  };

  await Promise.all(
    Array.from({ length: concurrency }, () => worker()),
  );

  const finishedAt = Date.now();
  const passCount = results.filter((r) => r.pass).length;
  const totalTokens = results.reduce(
    (acc, r) => ({
      input: acc.input + (r.agent.tokens?.input ?? 0),
      output: acc.output + (r.agent.tokens?.output ?? 0),
      cachedInput: acc.cachedInput + (r.agent.tokens?.cachedInput ?? 0),
    }),
    { input: 0, output: 0, cachedInput: 0 },
  );

  return {
    benchmarkId: opts.benchmark.id,
    adapter: opts.adapter.name,
    startedAt,
    finishedAt,
    durationMs: finishedAt - startedAt,
    passRate: results.length > 0 ? passCount / results.length : 0,
    totalTokens,
    tasks: results,
  };
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
