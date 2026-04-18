import type {
  ExecResult,
  Sandbox,
  SandboxState,
} from "@open-harness/sandbox";

export interface MockSandboxOptions {
  /** Pre-seeded filesystem. Keys are paths (absolute or relative to workingDirectory). */
  files?: Record<string, string>;
  /** Canned responses for exec() matched by predicate, first-match wins. */
  execResponses?: Array<{
    match: (command: string) => boolean;
    response: Partial<ExecResult> & { exitCode: number };
  }>;
  /** Override the workingDirectory (default "/work") */
  workingDirectory?: string;
}

export interface MockSandboxBundle {
  sandbox: Sandbox;
  state: SandboxState;
  execLog: string[];
  files: Map<string, string>;
}

/**
 * Pure in-memory sandbox. Implements Sandbox interface without touching the
 * real filesystem or spawning processes. Suitable for:
 *   - unit tests (harness runner tests already use this)
 *   - local UI demos without Vercel credentials
 *   - integration tests of new scorers
 *
 * Does NOT actually run shell commands — instead matches against the
 * configured `execResponses` table. For benchmarks that need real execution,
 * use a real Vercel sandbox.
 */
export function createMockSandbox(
  opts: MockSandboxOptions = {},
): MockSandboxBundle {
  const cwd = opts.workingDirectory ?? "/work";
  const files = new Map<string, string>();
  const execLog: string[] = [];

  const norm = (p: string): string => (p.startsWith(`${cwd}/`) ? p.slice(cwd.length + 1) : p);

  for (const [path, content] of Object.entries(opts.files ?? {})) {
    files.set(norm(path), content);
  }

  const sandbox: Sandbox = {
    type: "cloud",
    workingDirectory: cwd,

    async readFile(path) {
      const content = files.get(norm(path));
      if (content === undefined) throw new Error(`ENOENT: ${path}`);
      return content;
    },

    async writeFile(path, content) {
      files.set(norm(path), content);
    },

    async stat(path) {
      const exists = files.has(norm(path));
      return {
        isDirectory: () => false,
        isFile: () => exists,
        size: exists ? (files.get(norm(path))?.length ?? 0) : 0,
        mtimeMs: Date.now(),
      };
    },

    async access(path) {
      if (!files.has(norm(path))) {
        throw new Error(`ENOENT: ${path}`);
      }
    },

    async mkdir() {
      /* in-memory; no-op */
    },

    async readdir() {
      return [];
    },

    async exec(command) {
      execLog.push(command);
      const handler = opts.execResponses?.find((r) => r.match(command));
      if (handler) {
        const r = handler.response;
        return {
          success: r.exitCode === 0,
          exitCode: r.exitCode,
          stdout: r.stdout ?? "",
          stderr: r.stderr ?? "",
          truncated: r.truncated ?? false,
        };
      }
      return {
        success: true,
        exitCode: 0,
        stdout: "",
        stderr: "",
        truncated: false,
      };
    },

    async stop() {
      /* nothing to clean up */
    },
  };

  const state: SandboxState = { type: "vercel" } as SandboxState;

  return { sandbox, state, execLog, files };
}
