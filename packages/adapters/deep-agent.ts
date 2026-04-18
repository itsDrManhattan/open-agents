import {
  openHarnessAgent,
  type AgentSandboxContext,
  type OpenHarnessAgentModelInput,
} from "@open-harness/agent";
import type { LanguageModelUsage } from "ai";
import type { AgentAdapter, AgentRunContext, AgentRunResult } from "./types";

export interface DeepAgentAdapterConfig {
  /** Override adapter name (shows up in dashboards) */
  name?: string;
  /** Model for the main agent loop */
  model?: OpenHarnessAgentModelInput;
  /** Model for subagents invoked via the task tool */
  subagentModel?: OpenHarnessAgentModelInput;
  /** Extra instructions appended to the system prompt */
  customInstructions?: string;
}

/**
 * Wraps Open Agents' built-in deep agent as the first-party adapter.
 * Reference implementation — new adapters follow this shape.
 */
export function deepAgentAdapter(
  config: DeepAgentAdapterConfig = {},
): AgentAdapter {
  const name = config.name ?? "deep-agent";

  return {
    name,
    async run(ctx: AgentRunContext): Promise<AgentRunResult> {
      const start = Date.now();
      let turns = 0;
      let inputTokens = 0;
      let outputTokens = 0;
      let cachedInputTokens = 0;

      const sandboxContext: AgentSandboxContext = {
        state: ctx.sandboxState,
        workingDirectory: ctx.sandbox.workingDirectory,
        currentBranch: ctx.sandbox.currentBranch,
        environmentDetails: ctx.sandbox.environmentDetails,
      };

      try {
        const result = await openHarnessAgent.stream({
          prompt: ctx.taskPrompt,
          options: {
            sandbox: sandboxContext,
            model: config.model,
            subagentModel: config.subagentModel,
            customInstructions: config.customInstructions,
          },
          abortSignal: ctx.signal,
        });

        // Drive the stream to completion — ToolLoopAgent only makes progress
        // when its output is consumed.
        for await (const part of result.fullStream) {
          if (part.type === "start-step") {
            turns++;
          } else if (part.type === "finish-step") {
            const usage: LanguageModelUsage | undefined = part.usage;
            if (usage) {
              inputTokens += usage.inputTokens ?? 0;
              outputTokens += usage.outputTokens ?? 0;
              cachedInputTokens += usage.cachedInputTokens ?? 0;
            }
          }
        }

        const steps = await result.steps;

        return {
          success: true,
          turns: turns || steps.length,
          tokens: {
            input: inputTokens,
            output: outputTokens,
            cachedInput: cachedInputTokens,
          },
          durationMs: Date.now() - start,
          trace: { steps },
        };
      } catch (err) {
        return {
          success: false,
          turns,
          tokens: {
            input: inputTokens,
            output: outputTokens,
            cachedInput: cachedInputTokens,
          },
          durationMs: Date.now() - start,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  };
}
