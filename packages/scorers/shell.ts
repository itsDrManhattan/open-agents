import type { Scorer, ScoreContext, ScoreResult } from "./types";

export interface ShellScorerConfig {
  /** Shell command to run inside the sandbox */
  command: string;
  /** Working directory (default: sandbox.workingDirectory) */
  cwd?: string;
  /** Hard timeout in ms (default 60_000) */
  timeoutMs?: number;
  /** Exit codes considered a pass (default [0]) */
  passOnExitCodes?: number[];
  /** Override scorer name (default: derived from command) */
  name?: string;
}

/**
 * Runs a shell command in the sandbox and passes iff exit code matches.
 * The workhorse scorer — pytest, make test, tsc, etc. all wrap this.
 */
export function shellScorer(config: ShellScorerConfig): Scorer {
  const name = config.name ?? `shell:${config.command.slice(0, 60)}`;

  return {
    name,
    async score(ctx: ScoreContext): Promise<ScoreResult> {
      const cwd = config.cwd ?? ctx.cwd ?? ctx.sandbox.workingDirectory;
      const timeoutMs = config.timeoutMs ?? 60_000;
      const passOnExitCodes = config.passOnExitCodes ?? [0];

      const result = await ctx.sandbox.exec(config.command, cwd, timeoutMs, {
        signal: ctx.signal,
      });

      const pass =
        result.exitCode !== null && passOnExitCodes.includes(result.exitCode);

      return {
        pass,
        score: pass ? 1 : 0,
        scorer: name,
        message: pass
          ? `Command passed (exit ${result.exitCode})`
          : `Command failed (exit ${result.exitCode})`,
        evidence: {
          command: config.command,
          exitCode: result.exitCode,
          stdout: result.stdout.slice(0, 4_000),
          stderr: result.stderr.slice(0, 4_000),
          truncated: result.truncated,
        },
      };
    },
  };
}
