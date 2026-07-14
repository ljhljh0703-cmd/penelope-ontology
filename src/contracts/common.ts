import { z } from "zod";

export const IdentifierSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9][a-z0-9._-]*$/, "Use stable lowercase identifiers.");

export const HashSchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/, "Use a lowercase SHA-256 digest.");

export const VersionSchema = z.number().int().nonnegative();

export const addDuplicateIssues = (
  values: ReadonlyArray<string>,
  label: string,
  context: z.RefinementCtx,
): void => {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      context.addIssue({
        code: "custom",
        message: `Duplicate ${label}: ${value}`,
      });
    }
    seen.add(value);
  }
};
