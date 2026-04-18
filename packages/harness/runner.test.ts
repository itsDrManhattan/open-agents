import { describe, expect, test } from "bun:test";
import { mockAdapter } from "@open-harness/adapters";
import { loadBenchmarkFile, parseBenchmark } from "./loader";
import { createMockSandbox } from "./mock-sandbox";
import { runBenchmark, runTask } from "./runner";
import type { BenchmarkDef, SandboxFactory, TaskResult } from "./types";

const createMockAdapter = mockAdapter;

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

describe("parseBenchmark", () => {
  test("accepts a minimal valid benchmark", () => {
    const bench = parseBenchmark({
      id: "b1",
      name: "B1",
      tasks: [
        {
          id: "t1",
          prompt: "do the thing",
          scorers: [{ type: "file-exists", path: "out.txt" }],
        },
      ],
    });
    expect(bench.tasks).toHaveLength(1);
  });

  test("rejects a benchmark with no tasks", () => {
    expect(() =>
      parseBenchmark({ id: "b", name: "B", tasks: [] }),
    ).toThrow();
  });

  test("rejects a task with no scorers", () => {
    expect(() =>
      parseBenchmark({
        id: "b",
        name: "B",
        tasks: [{ id: "t", prompt: "x", scorers: [] }],
      }),
    ).toThrow();
  });
});

describe("loadBenchmarkFile", () => {
  test("loads and validates the toy benchmark from disk", async () => {
    const bench = await loadBenchmarkFile(
      `${import.meta.dir}/../../benchmarks/toy/toy-bench.json`,
    );
    expect(bench.id).toBe("toy-bench-v1");
    expect(bench.tasks.length).toBeGreaterThanOrEqual(3);
  });
});

describe("runTask", () => {
  test("passes when scorers pass", async () => {
    const { sandbox, state } = createMockSandbox({
      files: { "hello.txt": "Hello, world!" },
    });
    const adapter = mockAdapter();

    const result = await runTask({
      adapter,
      task: {
        id: "t1",
        prompt: "make hello.txt",
        scorers: [{ type: "file-exists", path: "hello.txt" }],
      },
      sandbox,
      sandboxState: state,
    });

    expect(result.pass).toBe(true);
    expect(result.aggregateScore).toBe(1);
    expect(result.scores).toHaveLength(1);
    expect(result.agent.success).toBe(true);
  });

  test("fails when file is missing", async () => {
    const { sandbox, state } = createMockSandbox();
    const adapter = mockAdapter();

    const result = await runTask({
      adapter,
      task: {
        id: "t1",
        prompt: "make hello.txt",
        scorers: [{ type: "file-exists", path: "hello.txt" }],
      },
      sandbox,
      sandboxState: state,
    });

    expect(result.pass).toBe(false);
    expect(result.aggregateScore).toBe(0);
  });

  test("records adapter errors", async () => {
    const { sandbox, state } = createMockSandbox();
    const adapter = mockAdapter({ throw: new Error("boom") });

    const result = await runTask({
      adapter,
      task: {
        id: "t1",
        prompt: "x",
        scorers: [{ type: "file-exists", path: "x" }],
      },
      sandbox,
      sandboxState: state,
    });

    // Mock adapter swallows throws and reports via agent.error — the
    // task-level boundary stays clean, scorers still run against whatever
    // state the sandbox is in.
    expect(result.pass).toBe(false);
    expect(result.agent.success).toBe(false);
    expect(result.agent.error).toContain("boom");
  });

  test("applies inline file setup before running the agent", async () => {
    const { sandbox, state } = createMockSandbox();
    const adapter = mockAdapter({
      solver: async (ctx) => {
        // Agent reads the seeded file, then writes a derived one
        const seed = await ctx.sandbox.readFile("/work/seed.txt", "utf-8");
        await ctx.sandbox.writeFile(
          "/work/out.txt",
          seed.toUpperCase(),
          "utf-8",
        );
      },
    });

    const result = await runTask({
      adapter,
      task: {
        id: "t1",
        prompt: "uppercase seed -> out",
        setup: { files: { "seed.txt": "hello" } },
        scorers: [{ type: "file-exists", path: "out.txt" }],
      },
      sandbox,
      sandboxState: state,
    });

    expect(result.pass).toBe(true);
    expect(await sandbox.readFile("/work/out.txt", "utf-8")).toBe("HELLO");
  });

  test("multiple scorers: overall pass only when all pass", async () => {
    const { sandbox, state } = createMockSandbox({
      files: { "a.txt": "a" },
      execResponses: [
        {
          match: (c) => c.includes("false"),
          response: { exitCode: 1 },
        },
      ],
    });
    const adapter = mockAdapter();

    const result = await runTask({
      adapter,
      task: {
        id: "t1",
        prompt: "x",
        scorers: [
          { type: "file-exists", path: "a.txt" },
          { type: "shell", command: "false" },
        ],
      },
      sandbox,
      sandboxState: state,
    });

    expect(result.scores).toHaveLength(2);
    expect(result.scores[0]?.pass).toBe(true);
    expect(result.scores[1]?.pass).toBe(false);
    expect(result.pass).toBe(false);
    expect(result.aggregateScore).toBe(0.5);
  });
});

describe("runBenchmark", () => {
  test("runs every task with concurrency, aggregates results", async () => {
    const benchmark: BenchmarkDef = {
      id: "b",
      name: "B",
      tasks: [
        {
          id: "t1",
          prompt: "x",
          scorers: [{ type: "file-exists", path: "x.txt" }],
        },
        {
          id: "t2",
          prompt: "y",
          scorers: [{ type: "file-exists", path: "y.txt" }],
        },
        {
          id: "t3",
          prompt: "z",
          scorers: [{ type: "file-exists", path: "z.txt" }],
        },
      ],
    };

    // Factory gives every task a sandbox that already has all three files.
    // (Matching a specific sandbox to a specific task would race under
    // concurrency; real factories provision task-agnostic base snapshots.)
    const factory: SandboxFactory = async () =>
      createMockSandbox({
        files: { "x.txt": "x", "y.txt": "y", "z.txt": "z" },
      });

    const adapter = mockAdapter();
    const completed: TaskResult[] = [];

    const result = await runBenchmark({
      adapter,
      benchmark,
      sandboxFactory: factory,
      concurrency: 2,
      onTaskComplete: (r) => completed.push(r),
    });

    expect(result.tasks).toHaveLength(3);
    expect(completed).toHaveLength(3);
    expect(result.passRate).toBe(1);
    expect(result.totalTokens.input).toBe(300);
    expect(result.totalTokens.output).toBe(150);
  });

  test("continues past a failing task and reports correct pass rate", async () => {
    const benchmark: BenchmarkDef = {
      id: "b",
      name: "B",
      tasks: [
        {
          id: "t1",
          prompt: "x",
          scorers: [{ type: "file-exists", path: "exists.txt" }],
        },
        {
          id: "t2",
          prompt: "x",
          scorers: [{ type: "file-exists", path: "missing.txt" }],
        },
      ],
    };

    const factory: SandboxFactory = async () =>
      createMockSandbox({ files: { "exists.txt": "ok" } });

    const result = await runBenchmark({
      adapter: mockAdapter(),
      benchmark,
      sandboxFactory: factory,
      concurrency: 2,
    });

    expect(result.tasks).toHaveLength(2);
    expect(result.passRate).toBe(0.5);
  });
});
