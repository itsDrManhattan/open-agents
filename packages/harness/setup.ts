import type { Sandbox } from "@open-harness/sandbox";
import type { SetupSpec } from "./types";

/**
 * Applies a SetupSpec to a fresh sandbox: clone repo, checkout commit,
 * seed inline files, run setup commands.
 *
 * Throws on any failure — the caller wraps this in the task's error boundary.
 */
export async function applySetup(
  sandbox: Sandbox,
  setup: SetupSpec | undefined,
  opts: { signal?: AbortSignal } = {},
): Promise<void> {
  if (!setup) return;

  const cwd = sandbox.workingDirectory;

  if (setup.repo) {
    // Clone into the existing cwd. `.` keeps the workingDirectory name.
    await mustExec(
      sandbox,
      `git clone ${shellQuote(setup.repo)} .`,
      cwd,
      240_000,
      opts.signal,
      "git clone failed",
    );

    if (setup.commit) {
      await mustExec(
        sandbox,
        `git checkout ${shellQuote(setup.commit)}`,
        cwd,
        60_000,
        opts.signal,
        "git checkout commit failed",
      );
    } else if (setup.branch) {
      await mustExec(
        sandbox,
        `git checkout ${shellQuote(setup.branch)}`,
        cwd,
        60_000,
        opts.signal,
        "git checkout branch failed",
      );
    }
  }

  if (setup.files) {
    for (const [path, content] of Object.entries(setup.files)) {
      const absPath = path.startsWith("/") ? path : `${cwd}/${path}`;
      // Ensure parent dir exists
      const parent = absPath.slice(0, absPath.lastIndexOf("/"));
      if (parent) {
        await sandbox.mkdir(parent, { recursive: true });
      }
      await sandbox.writeFile(absPath, content, "utf-8");
    }
  }

  for (const cmd of setup.setupCommands ?? []) {
    await mustExec(
      sandbox,
      cmd,
      cwd,
      300_000,
      opts.signal,
      `setup command failed: ${cmd}`,
    );
  }
}

async function mustExec(
  sandbox: Sandbox,
  command: string,
  cwd: string,
  timeoutMs: number,
  signal: AbortSignal | undefined,
  errorPrefix: string,
): Promise<void> {
  const r = await sandbox.exec(command, cwd, timeoutMs, { signal });
  if (!r.success || r.exitCode !== 0) {
    throw new Error(
      `${errorPrefix} (exit ${r.exitCode}): ${r.stderr.slice(0, 500)}`,
    );
  }
}

function shellQuote(s: string): string {
  // Minimal safe quoting for git URLs and commit SHAs
  if (/^[\w@:/.\-+]+$/.test(s)) return s;
  return `'${s.replace(/'/g, "'\\''")}'`;
}
