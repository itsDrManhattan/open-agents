import type { Sandbox } from "@open-harness/sandbox";
import type { AgentAdapter, AgentRunContext, AgentRunResult } from "./types";

export interface MockAdapterConfig {
  /** Adapter name shown in dashboards (default "mock") */
  name?: string;
  /**
   * Called once during run(). Mutate the sandbox here to simulate what the
   * "agent" did — useful for UI demos without real LLM calls.
   */
  solver?: (ctx: AgentRunContext) => Promise<void>;
  /** Fake turn count reported in the result (default 1) */
  turns?: number;
  /** Fake token counts (default { input: 100, output: 50 }) */
  tokens?: { input: number; output: number; cachedInput?: number };
  /** Artificial delay before returning (default 0) */
  delayMs?: number;
  /** Force a failure */
  throw?: Error;
}

/**
 * A stand-in adapter that doesn't call any real model.
 * Use for:
 *   - harness unit tests (no API costs)
 *   - local UI demos without provider credentials
 *   - smoke-testing new benchmarks before committing to a real run
 */
export function mockAdapter(config: MockAdapterConfig = {}): AgentAdapter {
  const name = config.name ?? "mock";
  const tokens = config.tokens ?? { input: 100, output: 50, cachedInput: 0 };

  return {
    name,
    async run(ctx: AgentRunContext): Promise<AgentRunResult> {
      const start = Date.now();
      try {
        if (config.throw) throw config.throw;
        if (config.delayMs) await sleep(config.delayMs, ctx.signal);
        await config.solver?.(ctx);
        return {
          success: true,
          turns: config.turns ?? 1,
          tokens,
          durationMs: Date.now() - start,
        };
      } catch (err) {
        return {
          success: false,
          turns: 0,
          durationMs: Date.now() - start,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  };
}

/**
 * Solver preset that cheats at the built-in toy benchmark.
 * Demonstrates the mock adapter flow end-to-end with real scorer passes.
 */
export async function toyBenchSolver(
  ctx: AgentRunContext,
): Promise<void> {
  const { sandbox, taskPrompt } = ctx;

  if (/hello\.txt/i.test(taskPrompt)) {
    await writeRel(sandbox, "hello.txt", "Hello, world!\n");
    return;
  }

  if (/mathutils\.py/i.test(taskPrompt)) {
    await writeRel(
      sandbox,
      "mathutils.py",
      "def add(a, b):\n    return a + b\n",
    );
    return;
  }

  if (/fizzbuzz/i.test(taskPrompt)) {
    await writeRel(
      sandbox,
      "fizzbuzz.py",
      [
        "def fizzbuzz(n: int) -> str:",
        "    if n % 15 == 0:",
        "        return 'FizzBuzz'",
        "    if n % 3 == 0:",
        "        return 'Fizz'",
        "    if n % 5 == 0:",
        "        return 'Buzz'",
        "    return str(n)",
        "",
      ].join("\n"),
    );
    return;
  }
}

async function writeRel(
  sandbox: Sandbox,
  relPath: string,
  content: string,
): Promise<void> {
  const abs = `${sandbox.workingDirectory}/${relPath}`;
  const parent = abs.slice(0, abs.lastIndexOf("/"));
  if (parent) await sandbox.mkdir(parent, { recursive: true });
  await sandbox.writeFile(abs, content, "utf-8");
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
