import { z } from "zod";
import {
  HashSchema,
  IdentifierSchema,
  VersionSchema,
  addDuplicateIssues,
} from "@/src/contracts/common";
import { ClaimSchema, RuleSchema } from "@/src/domain/schemas";

export const OverlayClaimSchema = ClaimSchema.extend({
  layerId: z.literal("creator_canon"),
  status: z.enum(["asserted", "attributed"]),
});

export const OverlayRuleSchema = RuleSchema.extend({
  layerId: z.literal("creator_canon"),
  status: z.literal("active"),
});

export const CanonOverlayPayloadSchema = z
  .object({
    id: z.literal("creator_canon"),
    version: VersionSchema,
    worldPackId: IdentifierSchema,
    worldPackVersion: z.string().min(1),
    claims: z.array(OverlayClaimSchema),
    rules: z.array(OverlayRuleSchema),
  })
  .strict()
  .superRefine((overlay, context) => {
    addDuplicateIssues(
      overlay.claims.map(({ id }) => id),
      "overlay claim id",
      context,
    );
    addDuplicateIssues(
      overlay.rules.map(({ id }) => id),
      "overlay rule id",
      context,
    );
  });

export const CanonOverlaySchema = z
  .object({
    id: z.literal("creator_canon"),
    version: VersionSchema,
    worldPackId: IdentifierSchema,
    worldPackVersion: z.string().min(1),
    claims: z.array(OverlayClaimSchema),
    rules: z.array(OverlayRuleSchema),
    hash: HashSchema,
  })
  .strict()
  .superRefine((overlay, context) => {
    addDuplicateIssues(
      overlay.claims.map(({ id }) => id),
      "overlay claim id",
      context,
    );
    addDuplicateIssues(
      overlay.rules.map(({ id }) => id),
      "overlay rule id",
      context,
    );
  });

export type CanonOverlayPayload = z.infer<typeof CanonOverlayPayloadSchema>;
export type CanonOverlay = z.infer<typeof CanonOverlaySchema>;
