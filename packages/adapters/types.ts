import type { Sandbox, SandboxState } from "@open-harness/sandbox";

/**
 * Everything an adapter needs to run one task inside an already-provisioned
 * sandbox. The harness owns sandbox lifecycle; adapters just drive the agent.
 */
export interface AgentRunContext {
  /** Live sandbox (provides filesystem/shell access) */
  sandbox: Sandbox;
  /**
   * Serializable sandbox state. Some agents (like deepAgent) re-connect to the
   * sandbox internally via its tools and need this reference.
   */
  sandboxState: SandboxState;
  /** The task prompt to feed the agent */
  taskPrompt: string;
  /** Hard timeout in ms — adapters should respect this */
  timeoutMs: number;
  /** Cancellation signal */
  signal?: AbortSignal;
}

/**
 * What the harness records about one agent run.
 * `success` means "the agent finished cleanly" — NOT that it did the task
 * correctly. Scorers decide correctness separately.
 */
export interface AgentRunResult {
  success: boolean;
  /** Number of model turns / tool-loop iterations */
  turns: number;
  /** Accumulated token usage */
  tokens?: {
    input: number;
    output: number;
    cachedInput?: number;
  };
  /** Wall-clock duration in ms */
  durationMs: number;
  /** Adapter-specific trace for replay in the dashboard */
  trace?: unknown;
  /** Error message if the run crashed or timed out */
  error?: string;
}

/**
 * An adapter plugs any agent framework into the harness.
 * Add a new adapter = support a new "agent under test".
 */
export interface AgentAdapter {
  readonly name: string;
  run(ctx: AgentRunContext): Promise<AgentRunResult>;
}
