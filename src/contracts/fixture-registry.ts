import { z } from "zod";
import { IdentifierSchema, addDuplicateIssues } from "@/src/contracts/common";

const FixtureReferenceSchema = z
  .object({
    id: IdentifierSchema,
    path: z.string().min(1).regex(/^[a-z0-9./-]+\.json$/),
  })
  .strict();

export const FixtureRegistrySchema = z
  .object({
    drafts: z.array(FixtureReferenceSchema).min(1),
    overlays: z.array(FixtureReferenceSchema).min(1),
    snapshots: z.array(FixtureReferenceSchema).min(1),
  })
  .strict()
  .superRefine((registry, context) => {
    addDuplicateIssues(registry.drafts.map(({ id }) => id), "draft fixture id", context);
    addDuplicateIssues(registry.overlays.map(({ id }) => id), "overlay fixture id", context);
    addDuplicateIssues(registry.snapshots.map(({ id }) => id), "snapshot fixture id", context);
  });

export type FixtureRegistry = z.infer<typeof FixtureRegistrySchema>;
