import { readdir, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { loadBenchmarkFile, type BenchmarkDef } from "@open-harness/harness";

/**
 * Walks up from process.cwd() to find the monorepo root (first dir
 * containing a `benchmarks/` subdir). Caches the resolved path.
 */
let cachedRoot: string | null = null;

async function findBenchmarksDir(): Promise<string> {
  if (cachedRoot) return cachedRoot;

  let dir = resolve(process.cwd());
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, "benchmarks");
    try {
      const s = await stat(candidate);
      if (s.isDirectory()) {
        cachedRoot = candidate;
        return candidate;
      }
    } catch {
      /* not here, keep walking */
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    `benchmarks/ directory not found walking up from ${process.cwd()}`,
  );
}

export interface BenchmarkSummary {
  id: string;
  name: string;
  description?: string;
  taskCount: number;
  filePath: string;
}

/**
 * Recursively find benchmark JSON files and return their summaries.
 */
export async function discoverBenchmarks(): Promise<BenchmarkSummary[]> {
  const root = await findBenchmarksDir();
  const files = await walkJson(root);
  const summaries: BenchmarkSummary[] = [];

  for (const file of files) {
    try {
      const bench = await loadBenchmarkFile(file);
      summaries.push({
        id: bench.id,
        name: bench.name,
        description: bench.description,
        taskCount: bench.tasks.length,
        filePath: file,
      });
    } catch {
      // Skip files that fail schema validation; don't crash discovery.
    }
  }

  return summaries.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Load a full benchmark definition by id (looked up via discovery).
 */
export async function loadBenchmarkById(
  id: string,
): Promise<BenchmarkDef | null> {
  const summaries = await discoverBenchmarks();
  const match = summaries.find((s) => s.id === id);
  if (!match) return null;
  return loadBenchmarkFile(match.filePath);
}

async function walkJson(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walkJson(full)));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      out.push(full);
    }
  }
  return out;
}
