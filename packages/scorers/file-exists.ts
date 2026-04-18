import path from "node:path";
import type { Scorer } from "./types";

export interface FileExistsScorerConfig {
  /** File path (relative to sandbox.workingDirectory by default) */
  path: string;
  /** Treat `path` as absolute when true (default false) */
  absolute?: boolean;
}

/**
 * Passes iff the given path exists in the sandbox filesystem.
 * Useful smoke-test scorer: "the agent created the file I asked for".
 */
export function fileExistsScorer(config: FileExistsScorerConfig): Scorer {
  const name = `file-exists:${config.path}`;

  return {
    name,
    async score(ctx) {
      const target = config.absolute
        ? config.path
        : path.join(ctx.sandbox.workingDirectory, config.path);

      try {
        await ctx.sandbox.access(target);
        return {
          pass: true,
          score: 1,
          scorer: name,
          message: `File exists: ${config.path}`,
        };
      } catch (err) {
        return {
          pass: false,
          score: 0,
          scorer: name,
          message: `File does not exist: ${config.path}`,
          evidence: { error: err instanceof Error ? err.message : String(err) },
        };
      }
    },
  };
}
