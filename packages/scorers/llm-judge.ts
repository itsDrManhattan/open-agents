import { generateObject, type LanguageModel } from "ai";
import { z } from "zod";
import type { Scorer } from "./types";

export interface LLMJudgeConfig {
  /** Rubric the judge applies */
  rubric: string;
  /** Language model (via AI SDK gateway) */
  model: LanguageModel;
  /**
   * Files to include as evidence (paths relative to workingDirectory).
   * Each file is truncated to ~10k chars.
   */
  evidenceFiles?: string[];
  /** Also include `git diff HEAD` output as evidence (default true) */
  includeGitDiff?: boolean;
  /** Override scorer name */
  name?: string;
}

const judgeSchema = z.object({
  pass: z.boolean(),
  score: z.number().min(0).max(1),
  reasoning: z.string(),
});

/**
 * Uses an LLM to judge whether the agent's work satisfies a rubric.
 * Feeds the LLM: the original task prompt, the rubric, evidence from the sandbox.
 */
export function llmJudgeScorer(config: LLMJudgeConfig): Scorer {
  const name = config.name ?? "llm-judge";

  return {
    name,
    async score(ctx) {
      const sections: string[] = [];

      if (config.includeGitDiff !== false) {
        try {
          const diff = await ctx.sandbox.exec(
            "git diff HEAD",
            ctx.sandbox.workingDirectory,
            30_000,
            { signal: ctx.signal },
          );
          if (diff.stdout.trim()) {
            sections.push(
              `## git diff HEAD\n\`\`\`diff\n${diff.stdout.slice(0, 20_000)}\n\`\`\``,
            );
          }
        } catch {
          // git not available or not a repo; skip
        }
      }

      for (const file of config.evidenceFiles ?? []) {
        try {
          const content = await ctx.sandbox.readFile(file, "utf-8");
          sections.push(
            `## ${file}\n\`\`\`\n${content.slice(0, 10_000)}\n\`\`\``,
          );
        } catch {
          // skip missing files
        }
      }

      const evidence = sections.length > 0
        ? sections.join("\n\n")
        : "(no evidence available)";

      const prompt = [
        `You are judging whether an AI agent completed a task correctly.`,
        ``,
        `## Task given to the agent`,
        ctx.taskPrompt,
        ``,
        `## Rubric`,
        config.rubric,
        ``,
        `## Evidence from the sandbox after the agent finished`,
        evidence,
        ``,
        `Judge whether the rubric is satisfied. Score between 0 and 1 (1 = fully satisfied).`,
      ].join("\n");

      const { object } = await generateObject({
        model: config.model,
        schema: judgeSchema,
        prompt,
        abortSignal: ctx.signal,
      });

      return {
        pass: object.pass,
        score: object.score,
        scorer: name,
        message: object.reasoning,
        evidence: { rubric: config.rubric },
      };
    },
  };
}
