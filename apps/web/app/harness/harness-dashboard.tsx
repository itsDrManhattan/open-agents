"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, Play, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface BenchmarkSummary {
  id: string;
  name: string;
  description?: string;
  taskCount: number;
}

interface ScoreView {
  scorer: string;
  pass: boolean;
  score: number;
  message?: string;
}

interface TaskResultView {
  taskId: string;
  adapter: string;
  pass: boolean;
  aggregateScore: number;
  scores: ScoreView[];
  agent: {
    success: boolean;
    turns: number;
    durationMs: number;
    tokens?: { input: number; output: number; cachedInput?: number };
    error?: string;
  };
  durationMs: number;
  error?: string;
}

interface BenchmarkRunResultView {
  benchmarkId: string;
  adapter: string;
  startedAt: number;
  finishedAt: number;
  durationMs: number;
  passRate: number;
  totalTokens: { input: number; output: number; cachedInput: number };
  tasks: TaskResultView[];
}

type AdapterKind = "mock-toy" | "mock-noop";

const ADAPTER_OPTIONS: Array<{ id: AdapterKind; label: string; help: string }> =
  [
    {
      id: "mock-toy",
      label: "Mock — toy solver",
      help: "No LLM calls. Fakes a correct solution for built-in toy tasks so you can see a full green run.",
    },
    {
      id: "mock-noop",
      label: "Mock — no-op",
      help: "Does nothing. Useful for seeing what failure looks like.",
    },
  ];

export function HarnessDashboard() {
  const [benchmarks, setBenchmarks] = useState<BenchmarkSummary[] | null>(null);
  const [benchmarksError, setBenchmarksError] = useState<string | null>(null);
  const [selectedBenchmarkId, setSelectedBenchmarkId] = useState<string>("");
  const [adapter, setAdapter] = useState<AdapterKind>("mock-toy");
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<BenchmarkRunResultView | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  // Load available benchmarks
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/harness/benchmarks");
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        setBenchmarks(body.benchmarks as BenchmarkSummary[]);
        if (body.benchmarks.length > 0 && !selectedBenchmarkId) {
          setSelectedBenchmarkId(body.benchmarks[0].id);
        }
      } catch (err) {
        if (cancelled) return;
        setBenchmarksError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedBenchmarkId]);

  const selectedBenchmark = benchmarks?.find(
    (b) => b.id === selectedBenchmarkId,
  );

  const handleRun = useCallback(async () => {
    if (!selectedBenchmarkId) return;
    setIsRunning(true);
    setRunError(null);
    setResult(null);
    try {
      const res = await fetch("/api/harness/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          benchmarkId: selectedBenchmarkId,
          adapter,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setResult(body.result as BenchmarkRunResultView);
    } catch (err) {
      setRunError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsRunning(false);
    }
  }, [selectedBenchmarkId, adapter]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Harness</h1>
        <p className="text-muted-foreground text-sm">
          Run benchmarks against an agent adapter. In-memory mode — no Vercel
          credentials needed.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Run a benchmark</CardTitle>
          <CardDescription>
            Pick a benchmark and an adapter. Results stream in below when the
            run finishes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Benchmark</label>
              {benchmarksError ? (
                <div className="text-destructive text-sm">
                  Failed to load: {benchmarksError}
                </div>
              ) : benchmarks === null ? (
                <div className="text-muted-foreground text-sm">Loading…</div>
              ) : benchmarks.length === 0 ? (
                <div className="text-muted-foreground text-sm">
                  No benchmarks found under <code>benchmarks/</code>.
                </div>
              ) : (
                <Select
                  value={selectedBenchmarkId}
                  onValueChange={setSelectedBenchmarkId}
                  disabled={isRunning}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {benchmarks.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}{" "}
                        <span className="text-muted-foreground">
                          ({b.taskCount} task{b.taskCount === 1 ? "" : "s"})
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {selectedBenchmark?.description ? (
                <p className="text-muted-foreground text-xs">
                  {selectedBenchmark.description}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Adapter</label>
              <Select
                value={adapter}
                onValueChange={(v) => setAdapter(v as AdapterKind)}
                disabled={isRunning}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ADAPTER_OPTIONS.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs">
                {ADAPTER_OPTIONS.find((o) => o.id === adapter)?.help}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={handleRun}
              disabled={!selectedBenchmarkId || isRunning}
            >
              {isRunning ? (
                <>
                  <Loader2 className="animate-spin" /> Running…
                </>
              ) : (
                <>
                  <Play /> Run benchmark
                </>
              )}
            </Button>
            {runError ? (
              <span className="text-destructive text-sm">{runError}</span>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {result ? <ResultSection result={result} /> : null}
    </div>
  );
}

function ResultSection({ result }: { result: BenchmarkRunResultView }) {
  const passCount = result.tasks.filter((t) => t.pass).length;
  const failCount = result.tasks.length - passCount;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Results</CardTitle>
        <CardDescription>
          Adapter <code>{result.adapter}</code> · Duration{" "}
          {formatDuration(result.durationMs)} · Tokens{" "}
          {result.totalTokens.input}/{result.totalTokens.output} (in/out)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2 text-sm">
          <StatBadge
            kind={passCount === result.tasks.length ? "pass" : "neutral"}
            label="Pass rate"
            value={`${Math.round(result.passRate * 100)}%`}
          />
          <StatBadge kind="pass" label="Pass" value={String(passCount)} />
          <StatBadge
            kind={failCount > 0 ? "fail" : "neutral"}
            label="Fail"
            value={String(failCount)}
          />
          <StatBadge
            kind="neutral"
            label="Total"
            value={String(result.tasks.length)}
          />
        </div>

        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium">Task</th>
                <th className="px-3 py-2 font-medium">Verdict</th>
                <th className="px-3 py-2 font-medium">Score</th>
                <th className="px-3 py-2 font-medium">Scorers</th>
                <th className="px-3 py-2 font-medium">Turns</th>
                <th className="px-3 py-2 font-medium">Duration</th>
              </tr>
            </thead>
            <tbody>
              {result.tasks.map((task) => (
                <tr key={task.taskId} className="border-t">
                  <td className="px-3 py-2 font-mono text-xs">{task.taskId}</td>
                  <td className="px-3 py-2">
                    <VerdictPill pass={task.pass} />
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {task.aggregateScore.toFixed(2)}
                  </td>
                  <td className="px-3 py-2">
                    <ScorerBreakdown scores={task.scores} />
                  </td>
                  <td className="px-3 py-2 tabular-nums">{task.agent.turns}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {formatDuration(task.durationMs)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function VerdictPill({ pass }: { pass: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        pass
          ? "bg-green-500/15 text-green-700 dark:text-green-400"
          : "bg-red-500/15 text-red-700 dark:text-red-400",
      )}
    >
      {pass ? (
        <>
          <CheckCircle2 className="size-3" /> Pass
        </>
      ) : (
        <>
          <XCircle className="size-3" /> Fail
        </>
      )}
    </span>
  );
}

function ScorerBreakdown({ scores }: { scores: ScoreView[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {scores.map((s, i) => (
        <span
          key={`${s.scorer}-${i}`}
          title={`${s.scorer}${s.message ? `: ${s.message}` : ""}`}
          className={cn(
            "rounded px-1.5 py-0.5 font-mono text-xs",
            s.pass
              ? "bg-green-500/10 text-green-700 dark:text-green-400"
              : "bg-red-500/10 text-red-700 dark:text-red-400",
          )}
        >
          {s.scorer.split(":")[0]}
        </span>
      ))}
    </div>
  );
}

function StatBadge({
  kind,
  label,
  value,
}: {
  kind: "pass" | "fail" | "neutral";
  label: string;
  value: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1",
        kind === "pass" && "border-green-500/30 bg-green-500/10",
        kind === "fail" && "border-red-500/30 bg-red-500/10",
        kind === "neutral" && "bg-muted/40",
      )}
    >
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="tabular-nums font-semibold">{value}</span>
    </span>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}
