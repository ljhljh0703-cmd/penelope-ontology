import { z } from "zod";
import { IdentifierSchema, addDuplicateIssues } from "@/src/contracts/common";

export const StyleConstraintKindSchema = z.enum([
  "viewpoint",
  "tense",
  "dialogue_mode",
  "prose_goal",
  "avoidance",
  "prohibited_phrase",
  "max_words",
]);

export const StyleConstraintSchema = z
  .object({
    id: IdentifierSchema,
    kind: StyleConstraintKindSchema,
    value: z.union([z.string().min(1), z.number().int().positive()]),
    checkMode: z.enum(["deterministic", "human"]),
  })
  .strict()
  .superRefine((constraint, context) => {
    if (constraint.kind === "max_words" && typeof constraint.value !== "number") {
      context.addIssue({
        code: "custom",
        path: ["value"],
        message: "max_words requires a positive integer value.",
      });
    }
    if (constraint.kind !== "max_words" && typeof constraint.value !== "string") {
      context.addIssue({
        code: "custom",
        path: ["value"],
        message: `${constraint.kind} requires a string value.`,
      });
    }
    if (
      constraint.checkMode === "deterministic" &&
      !["max_words", "prohibited_phrase"].includes(constraint.kind)
    ) {
      context.addIssue({
        code: "custom",
        path: ["checkMode"],
        message: `${constraint.kind} is a human-reviewed style constraint.`,
      });
    }
  });

export const StyleProfileSchema = z
  .object({
    id: IdentifierSchema,
    label: z.string().min(1),
    constraints: z.array(StyleConstraintSchema).min(1),
  })
  .strict()
  .superRefine((profile, context) => {
    addDuplicateIssues(
      profile.constraints.map(({ id }) => id),
      "style constraint id",
      context,
    );
  });

export const StyleProfileSetSchema = z
  .array(StyleProfileSchema)
  .min(1)
  .superRefine((profiles, context) => {
    addDuplicateIssues(
      profiles.map(({ id }) => id),
      "style profile id",
      context,
    );
  });

export type StyleConstraint = z.infer<typeof StyleConstraintSchema>;
export type StyleProfile = z.infer<typeof StyleProfileSchema>;
