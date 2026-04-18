import { readFile } from "node:fs/promises";
import { benchmarkDefSchema, type BenchmarkDef } from "./types";

/**
 * Parse + validate a benchmark definition from a plain object.
 * Throws a ZodError with a readable message on invalid input.
 */
export function parseBenchmark(input: unknown): BenchmarkDef {
  return benchmarkDefSchema.parse(input);
}

/**
 * Load a benchmark definition from a JSON file on disk.
 * YAML support can be added later — benchmarks are JSON for MVP.
 */
export async function loadBenchmarkFile(path: string): Promise<BenchmarkDef> {
  const raw = await readFile(path, "utf-8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `Failed to parse benchmark JSON at ${path}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
  return parseBenchmark(parsed);
}
