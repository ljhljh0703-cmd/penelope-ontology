import { z } from "zod";
import { HashSchema, IdentifierSchema, addDuplicateIssues } from "@/src/contracts/common";
import { ParticipantIntentSetSchema } from "@/src/contracts/participant-intent";
import { ViolationCodeSchema } from "@/src/contracts/run";
import { SimulationVariableValueSchema } from "@/src/contracts/simulation";

export const ReplayRunExpectationSchema = z
  .object({
    status: z.enum(["passed", "blocked", "needs_creator_decision"]),
    requiredViolationCodes: z.array(ViolationCodeSchema),
    forbiddenViolationCodes: z.array(ViolationCodeSchema),
    proposalIds: z.array(IdentifierSchema),
  })
  .strict();

export const ReplayRunStageSchema = z
  .object({
    kind: z.literal("run"),
    stageId: IdentifierSchema,
    overlayFixtureId: IdentifierSchema,
    snapshotFixtureId: IdentifierSchema,
    draftFixtureId: IdentifierSchema,
    styleProfileId: IdentifierSchema,
    taskType: z.enum(["query", "scene", "action", "expand"]),
    brief: z.string().min(1),
    participantIntents: ParticipantIntentSetSchema,
    expected: ReplayRunExpectationSchema,
  })
  .strict();

export const ReplayDecisionStageSchema = z
  .object({
    kind: z.literal("decision"),
    stageId: IdentifierSchema,
    proposalFromStageId: IdentifierSchema,
    action: z.enum(["accept", "edit", "reject"]),
    expectedOverlayFixtureId: IdentifierSchema,
    expectedSnapshotFixtureId: IdentifierSchema,
  })
  .strict();

export const ReplayTransitionStageSchema = z
  .object({
    kind: z.literal("transition"),
    stageId: IdentifierSchema,
    overlayFixtureId: IdentifierSchema,
    snapshotFixtureId: IdentifierSchema,
    draftFixtureId: IdentifierSchema,
    participantIntents: ParticipantIntentSetSchema,
    expected: z
      .object({
        status: z.enum(["applied", "blocked"]),
        fromStateHash: HashSchema,
        toStateHash: HashSchema,
        turnIndex: z.number().int().min(0).max(2),
        variables: z.array(SimulationVariableValueSchema),
      })
      .strict(),
  })
  .strict();

export const ReplayStageSchema = z.discriminatedUnion("kind", [
  ReplayRunStageSchema,
  ReplayDecisionStageSchema,
  ReplayTransitionStageSchema,
]);

export const ReplayCaseSchema = z
  .object({
    id: IdentifierSchema,
    description: z.string().min(1),
    stages: z.array(ReplayStageSchema).min(1),
  })
  .strict()
  .superRefine((replayCase, context) => {
    addDuplicateIssues(
      replayCase.stages.map(({ stageId }) => stageId),
      "replay stage id",
      context,
    );
    if (replayCase.stages[0]?.kind !== "run") {
      context.addIssue({
        code: "custom",
        path: ["stages", 0],
        message: "Every replay case must begin with a structured run stage.",
      });
    }
  });

export const ReplayCaseSetSchema = z
  .array(ReplayCaseSchema)
  .min(1)
  .superRefine((cases, context) => {
    addDuplicateIssues(
      cases.map(({ id }) => id),
      "replay case id",
      context,
    );
  });

export type ReplayCase = z.infer<typeof ReplayCaseSchema>;
export type ReplayStage = z.infer<typeof ReplayStageSchema>;
