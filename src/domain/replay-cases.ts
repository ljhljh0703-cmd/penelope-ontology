import { z } from "zod";
import { HardViolationSchema } from "@/src/contracts/run";
import { IdentifierSchema, type WorldPack } from "@/src/domain/schemas";

const ViolationCodeSchema = HardViolationSchema.shape.code;

export const ReplayCaseSchema = z
  .object({
    id: IdentifierSchema,
    stateId: IdentifierSchema,
    canonProfileId: IdentifierSchema,
    prompt: z.string().min(1),
    expectedStatus: z.enum(["passed", "blocked", "needs_creator_decision"]),
    requiredViolationCodes: z.array(ViolationCodeSchema),
  })
  .strict();

export const ReplayCaseSetSchema = z
  .array(ReplayCaseSchema)
  .min(1)
  .superRefine((cases, context) => {
    const seen = new Set<string>();
    for (const replayCase of cases) {
      if (seen.has(replayCase.id)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate replay case id: ${replayCase.id}`,
        });
      }
      seen.add(replayCase.id);
    }
  });

export type ReplayCase = z.infer<typeof ReplayCaseSchema>;

export const validateReplayCaseReferences = (
  pack: WorldPack,
  cases: ReadonlyArray<ReplayCase>,
): string[] => {
  const stateIds = new Set(pack.states.map(({ id }) => id));
  const profileIds = new Set(pack.canonProfiles.map(({ id }) => id));
  const declaredIds = new Set(pack.replayCaseIds);
  const fixtureIds = new Set(cases.map(({ id }) => id));
  const issues: string[] = [];

  for (const replayCase of cases) {
    if (!stateIds.has(replayCase.stateId)) {
      issues.push(`Replay ${replayCase.id} has unknown state ${replayCase.stateId}`);
    }
    if (!profileIds.has(replayCase.canonProfileId)) {
      issues.push(`Replay ${replayCase.id} has unknown canon profile ${replayCase.canonProfileId}`);
    }
  }

  for (const id of declaredIds) {
    if (!fixtureIds.has(id)) issues.push(`World Pack declares missing replay fixture ${id}`);
  }
  for (const id of fixtureIds) {
    if (!declaredIds.has(id)) issues.push(`Replay fixture ${id} is not declared by the World Pack`);
  }

  return issues.sort();
};
