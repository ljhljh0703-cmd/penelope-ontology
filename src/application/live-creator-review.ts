import { z } from "zod";
import {
  CreatorDecisionSchema,
  type CreatorDecision,
} from "@/src/contracts/creator-decision";
import { MAX_DISPLAY_DESCRIPTION_LENGTH } from "@/src/contracts/proposal";
import { RunResultSchema, type RunResult } from "@/src/contracts/run";
import {
  evaluateLiveRedSailRunResult,
  LIVE_RED_SAIL_SCENARIO_CONTRACT,
} from "@/src/evidence/live-scenario-contract";

export const SimpleCreatorDecisionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("accept") }).strict(),
  z
    .object({
      action: z.literal("edit"),
      displayDescription: z
        .string()
        .trim()
        .min(1)
        .max(MAX_DISPLAY_DESCRIPTION_LENGTH)
        .refine(
          (value) =>
            [...value].every(
              (character) =>
                !/\p{Letter}/u.test(character) ||
                /\p{Script=Latin}/u.test(character),
            ),
          "The English submission review accepts Latin-script display wording only.",
        ),
    })
    .strict(),
  z.object({ action: z.literal("reject") }).strict(),
]);

export type SimpleCreatorDecision = z.infer<
  typeof SimpleCreatorDecisionSchema
>;

const verifiedRedSailResult = (input: unknown): RunResult => {
  const result = RunResultSchema.parse(input);
  const verdict = evaluateLiveRedSailRunResult(result);
  if (!verdict.ok) {
    throw new Error(
      `The private live result failed the registered creator-review gate: ${verdict.issues.join(",")}.`,
    );
  }
  return result;
};

export const bindSimpleCreatorDecision = ({
  liveRun: liveRunInput,
  decision: decisionInput,
}: {
  liveRun: unknown;
  decision: unknown;
}): CreatorDecision => {
  const liveRun = verifiedRedSailResult(liveRunInput);
  const decision = SimpleCreatorDecisionSchema.parse(decisionInput);
  const proposal = liveRun.proposals[0];
  if (!proposal) {
    throw new Error("The registered live proposal is unavailable.");
  }

  const authority = {
    proposalId: proposal.id,
    proposalHash: proposal.proposalHash,
    baseOverlayId: proposal.baseOverlayId,
    baseOverlayVersion: proposal.baseOverlayVersion,
    baseOverlayHash: proposal.baseOverlayHash,
  } as const;

  if (decision.action !== "edit") {
    return CreatorDecisionSchema.parse({ ...authority, action: decision.action });
  }

  const patches = proposal.patches.map((patch) => {
    if (patch.op !== "add_rule") {
      throw new Error("The registered display edit supports its one rule only.");
    }
    return {
      ...patch,
      rule: {
        ...patch.rule,
        displayDescription: decision.displayDescription,
      },
    };
  });
  return CreatorDecisionSchema.parse({
    ...authority,
    action: "edit",
    patches,
  });
};

const markdownText = (value: string): string =>
  value
    .replaceAll("\r", " ")
    .trim()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replace(/([\\`*_[\]{}()#+\-.!|])/gu, "\\$1");

/**
 * Private, local-only creative review. This intentionally contains generated
 * prose and therefore belongs only under the gitignored artifacts/live tree.
 */
export const renderPrivateLiveCreatorReview = (input: unknown): string => {
  const liveRun = verifiedRedSailResult(input);
  if (liveRun.modelOutcome.outcome !== "completed") {
    throw new Error("The registered live result did not contain a draft.");
  }
  const draft = liveRun.modelOutcome.draft;
  const proposal = liveRun.proposals[0];
  const patch = proposal?.patches[0];
  if (!proposal || patch?.op !== "add_rule") {
    throw new Error("The registered live proposal is unavailable.");
  }

  const dialogue = draft.utterances
    .map(
      ({ speakerId, text }) =>
        `- **${speakerId}**: ${markdownText(text)}`,
    )
    .join("\n");
  const currentDisplay =
    patch.rule.displayDescription ??
    "(No separate display wording — use the canonical meaning as written.)";

  return [
    "# Private Creator Review — Red-Sail Scene",
    "",
    "> This file contains generated prose. Do not copy it outside `artifacts/live/` or add it to Git.",
    "",
    "## Generated Scene",
    "",
    markdownText(draft.narrative),
    "",
    "## Dialogue and Participant Intent",
    "",
    dialogue,
    "",
    "## World Expansion Proposal",
    "",
    `- Locked meaning: ${markdownText(patch.rule.description)}`,
    `- Current display wording: ${markdownText(currentDisplay)}`,
    `- Proposal ID: ${proposal.id}`,
    "",
    "## Creator Decision",
    "",
    "Set `action` in `artifacts/live/creator-decision.json` to one of the following:",
    "",
    "- `accept`: approve the locked meaning and current display wording",
    "- `edit`: preserve the canonical meaning and change `displayDescription` only",
    "- `reject`: leave both canon and state unchanged",
    "",
    `Registered contract: ${LIVE_RED_SAIL_SCENARIO_CONTRACT.id}`,
    "",
  ].join("\n");
};
