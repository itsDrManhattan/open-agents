import { generateText, stepCountIs, tool, type LanguageModel } from "ai";
import { z } from "zod";
import type { AgentAdapter, AgentRunContext, AgentRunResult } from "./types";

export interface AiSdkAdapterConfig {
  /** Adapter name shown in dashboards */
  name?: string;
  /** Language model (from the AI SDK gateway) */
  model: LanguageModel;
  /** System prompt */
  system?: string;
  /** Max tool-loop steps (default 30) */
  maxSteps?: number;
}

/**
 * Minimal "bring-your-own-agent" adapter built directly on the AI SDK.
 * Exposes a tiny tool surface (bash, read, write) — useful for:
 *   - testing the harness itself (fewer moving parts than deepAgent)
 *   - showing contributors how to add a new adapter
 */
export function aiSdkAdapter(config: AiSdkAdapterConfig): AgentAdapter {
  const name = config.name ?? "ai-sdk";

  return {
    name,
    async run(ctx: AgentRunContext): Promise<AgentRunResult> {
      const start = Date.now();
      const { sandbox } = ctx;
      const cwd = sandbox.workingDirectory;

      try {
        const result = await generateText({
          model: config.model,
          system: config.system ?? defaultSystem,
          prompt: ctx.taskPrompt,
          stopWhen: stepCountIs(config.maxSteps ?? 30),
          abortSignal: ctx.signal,
          tools: {
            bash: tool({
              description: "Run a shell command in the sandbox",
              inputSchema: z.object({
                command: z.string(),
                timeoutMs: z.number().optional(),
              }),
              execute: async ({ command, timeoutMs }) => {
                const r = await sandbox.exec(command, cwd, timeoutMs ?? 60_000);
                return {
                  exitCode: r.exitCode,
                  stdout: r.stdout.slice(0, 10_000),
                  stderr: r.stderr.slice(0, 10_000),
                };
              },
            }),
            read: tool({
              description: "Read a file from the sandbox",
              inputSchema: z.object({ path: z.string() }),
              execute: async ({ path }) => {
                try {
                  const content = await sandbox.readFile(path, "utf-8");
                  return { content };
                } catch (err) {
                  return {
                    error: err instanceof Error ? err.message : String(err),
                  };
                }
              },
            }),
            write: tool({
              description: "Write or overwrite a file in the sandbox",
              inputSchema: z.object({
                path: z.string(),
                content: z.string(),
              }),
              execute: async ({ path, content }) => {
                await sandbox.writeFile(path, content, "utf-8");
                return { ok: true };
              },
            }),
          },
        });

        return {
          success: true,
          turns: result.steps.length,
          tokens: {
            input: result.usage.inputTokens ?? 0,
            output: result.usage.outputTokens ?? 0,
            cachedInput: result.usage.cachedInputTokens ?? 0,
          },
          durationMs: Date.now() - start,
          trace: { steps: result.steps, finalText: result.text },
        };
      } catch (err) {
        return {
          success: false,
          turns: 0,
          durationMs: Date.now() - start,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  };
}

const defaultSystem = `You are a coding agent working inside a Linux sandbox.
You have three tools: bash, read, write.
Keep going until the task is complete. Do not ask clarifying questions — make reasonable assumptions.`;
