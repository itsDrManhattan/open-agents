import { NextResponse } from "next/server";
import { mockAdapter, toyBenchSolver } from "@open-harness/adapters";
import {
  createMockSandbox,
  runBenchmark,
  type SandboxFactory,
} from "@open-harness/harness";
import { loadBenchmarkById } from "@/lib/harness/discovery";

export const dynamic = "force-dynamic";
// Allow up to 60s for mock runs; tune upward when real sandboxes are wired.
export const maxDuration = 60;

interface RunRequestBody {
  benchmarkId: string;
  adapter?: "mock-toy" | "mock-noop";
  concurrency?: number;
}

export async function POST(req: Request) {
  let body: RunRequestBody;
  try {
    body = (await req.json()) as RunRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.benchmarkId || typeof body.benchmarkId !== "string") {
    return NextResponse.json(
      { error: "`benchmarkId` is required" },
      { status: 400 },
    );
  }

  const benchmark = await loadBenchmarkById(body.benchmarkId);
  if (!benchmark) {
    return NextResponse.json(
      { error: `Benchmark not found: ${body.benchmarkId}` },
      { status: 404 },
    );
  }

  // Adapter selection. Real-model adapters are gated behind credentials and
  // will be wired in a follow-up; for now the dashboard exercises the full
  // pipeline with no external dependencies.
  const adapterKind = body.adapter ?? "mock-toy";
  const adapter =
    adapterKind === "mock-toy"
      ? mockAdapter({
          name: "mock-toy-solver",
          solver: toyBenchSolver,
          tokens: { input: 120, output: 80, cachedInput: 0 },
          delayMs: 300,
        })
      : mockAdapter({ name: "mock-noop" });

  // Every task gets a fresh in-memory sandbox. Real runs swap this factory
  // for one that provisions Vercel sandboxes.
  const sandboxFactory: SandboxFactory = async () => {
    const bundle = createMockSandbox({
      // Pre-fake `pytest` so toy tasks score correctly without Python installed.
      execResponses: [
        {
          match: (c) => c.includes("pytest"),
          response: {
            exitCode: 0,
            stdout: "== 3 passed in 0.01s ==",
          },
        },
        {
          match: (c) => c.startsWith("grep"),
          response: { exitCode: 0 },
        },
        {
          match: (c) => c.includes("pip install"),
          response: { exitCode: 0 },
        },
      ],
    });
    return { sandbox: bundle.sandbox, state: bundle.state };
  };

  try {
    const result = await runBenchmark({
      adapter,
      benchmark,
      sandboxFactory,
      concurrency: Math.min(Math.max(body.concurrency ?? 3, 1), 8),
    });
    return NextResponse.json({ result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
