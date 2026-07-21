import { z } from "zod";
import { HashSchema, IdentifierSchema, addDuplicateIssues } from "@/src/contracts/common";
import { WorldNarratorResolvedEventSchema } from "@/src/contracts/world-narrator";

export const VISUAL_MOMENT_FORMAT = "penelope_visual_moment_request" as const;
export const VISUAL_MOMENT_SCHEMA_VERSION = 1 as const;
export const FATE_FRAME_WIDTH = 48 as const;
export const FATE_FRAME_HEIGHT = 24 as const;

export const VisualMomentTriggerSchema = z.enum([
  "irreversible_choice",
  "ending_divergence",
  "secret_reveal",
  "dramatic_clock_threshold",
  "scene_climax",
]);

export const LimitedPaletteColorSchema = z
  .string()
  .regex(/^#[0-9a-f]{6}$/u, "Use a lowercase six-digit hex color.");

export const VisualMomentRequestSchema = z
  .object({
    format: z.literal(VISUAL_MOMENT_FORMAT),
    schemaVersion: z.literal(VISUAL_MOMENT_SCHEMA_VERSION),
    momentId: IdentifierSchema,
    checkpointId: z.uuid(),
    scenarioId: IdentifierSchema,
    trigger: VisualMomentTriggerSchema,
    sceneTitle: z.string().trim().min(1).max(120),
    visibleFacts: z
      .array(
        z
          .object({
            id: IdentifierSchema,
            summary: z.string().trim().min(3).max(600),
          })
          .strict(),
      )
      .min(1)
      .max(24),
    visibleEvents: z.array(WorldNarratorResolvedEventSchema).min(1).max(8),
    palette: z.array(LimitedPaletteColorSchema).min(3).max(5),
    variant: z.number().int().min(0).max(8),
  })
  .strict()
  .superRefine((request, context) => {
    addDuplicateIssues(
      request.visibleFacts.map(({ id }) => id),
      "visual-moment visible fact id",
      context,
    );
    addDuplicateIssues(
      request.visibleEvents.map(({ eventId }) => eventId),
      "visual-moment visible event id",
      context,
    );
    addDuplicateIssues(request.palette, "visual-moment palette color", context);
  });

export const IllustrationSourceGridSchema = z
  .object({
    width: z.literal(FATE_FRAME_WIDTH),
    height: z.literal(FATE_FRAME_HEIGHT),
    pixels: z
      .array(z.number().int().min(0).max(255))
      .length(FATE_FRAME_WIDTH * FATE_FRAME_HEIGHT),
    sourceHash: HashSchema,
    altText: z.string().trim().min(12).max(300),
  })
  .strict();

export const AsciiFrameSchema = z
  .object({
    format: z.literal("limited_color_ascii_v1"),
    width: z.literal(FATE_FRAME_WIDTH),
    height: z.literal(FATE_FRAME_HEIGHT),
    palette: z.array(LimitedPaletteColorSchema).min(3).max(5),
    glyphRows: z.array(z.string().length(FATE_FRAME_WIDTH)).length(FATE_FRAME_HEIGHT),
    colorRows: z.array(z.string().length(FATE_FRAME_WIDTH)).length(FATE_FRAME_HEIGHT),
    sourceHash: HashSchema,
    renderHash: HashSchema,
    altText: z.string().trim().min(12).max(300),
  })
  .strict()
  .superRefine((frame, context) => {
    const maxColorIndex = frame.palette.length - 1;
    for (const [rowIndex, row] of frame.colorRows.entries()) {
      for (const [columnIndex, value] of [...row].entries()) {
        const colorIndex = Number(value);
        if (!Number.isInteger(colorIndex) || colorIndex > maxColorIndex) {
          context.addIssue({
            code: "custom",
            path: ["colorRows", rowIndex, columnIndex],
            message: "ASCII color rows may reference only the declared limited palette.",
          });
        }
      }
    }
  });

export const VisualMomentCandidateSchema = z
  .object({
    candidateId: IdentifierSchema,
    checkpointId: z.uuid(),
    status: z.literal("candidate"),
    trigger: VisualMomentTriggerSchema,
    requestDigest: HashSchema,
    frame: AsciiFrameSchema,
    providerTrace: z
      .object({
        provenance: z.literal("fixture"),
        adapterId: IdentifierSchema,
      })
      .strict(),
  })
  .strict();

export const VisualMomentDecisionSchema = z
  .object({
    candidateId: IdentifierSchema,
    checkpointId: z.uuid(),
    renderHash: HashSchema,
    status: z.enum(["approved", "reference_only", "rejected"]),
    bindsToCheckpoint: z.boolean(),
  })
  .strict()
  .superRefine((decision, context) => {
    if (decision.bindsToCheckpoint !== (decision.status === "approved")) {
      context.addIssue({
        code: "custom",
        path: ["bindsToCheckpoint"],
        message: "Only an approved Fate Frame may bind to a checkpoint.",
      });
    }
  });

export type VisualMomentTrigger = z.infer<typeof VisualMomentTriggerSchema>;
export type VisualMomentRequest = z.infer<typeof VisualMomentRequestSchema>;
export type IllustrationSourceGrid = z.infer<typeof IllustrationSourceGridSchema>;
export type AsciiFrame = z.infer<typeof AsciiFrameSchema>;
export type VisualMomentCandidate = z.infer<typeof VisualMomentCandidateSchema>;
export type VisualMomentDecision = z.infer<typeof VisualMomentDecisionSchema>;
