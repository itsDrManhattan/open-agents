import {
  fileExistsScorer,
  llmJudgeScorer,
  pytestScorer,
  shellScorer,
  type Scorer,
} from "@open-harness/scorers";
import type { LanguageModel } from "ai";
import type { ScorerSpec } from "./types";

export interface ScorerFactoryContext {
  /** Required when the benchmark uses `llm-judge` scorers */
  judgeModel?: LanguageModel;
}

/**
 * Instantiates a Scorer from its declarative spec.
 * New scorer types: extend both `scorerSpecSchema` and this switch.
 */
export function createScorer(
  spec: ScorerSpec,
  ctx: ScorerFactoryContext = {},
): Scorer {
  switch (spec.type) {
    case "shell":
      return shellScorer({
        command: spec.command,
        cwd: spec.cwd,
        timeoutMs: spec.timeoutMs,
        passOnExitCodes: spec.passOnExitCodes,
      });
    case "pytest":
      return pytestScorer({
        target: spec.target,
        testId: spec.testId,
        cwd: spec.cwd,
        timeoutMs: spec.timeoutMs,
      });
    case "file-exists":
      return fileExistsScorer({ path: spec.path });
    case "llm-judge": {
      if (!ctx.judgeModel) {
        throw new Error(
          "Benchmark uses `llm-judge` scorer but no judgeModel was provided to the runner.",
        );
      }
      return llmJudgeScorer({
        rubric: spec.rubric,
        model: ctx.judgeModel,
        evidenceFiles: spec.evidenceFiles,
        includeGitDiff: spec.includeGitDiff,
      });
    }
  }
}
