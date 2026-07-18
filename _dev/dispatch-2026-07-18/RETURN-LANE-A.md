# RETURN-LANE-A — candidate-2.1 contract surface

Status: `CONTRACT_SURFACE_PASS / W1_RUNTIME_PENDING / COMMITTED`

## Authority and scope

- W0 checkpoint: `aaaf2806d0f3fcad386248f8b9a0ea882d0950f4`
- Implementation commit: `b073be98a60685c513a334c8480aa5c515edebf8`
- Changed source files:
  - `src/contracts/world-narrator.ts`
  - `src/contracts/narration-license.ts` (new)
- No adapter, service, fixture, test, private record, or Vault file was changed by Lane A.

## Implemented contract surface

All six bundled JSON-schema roots now have strict Zod runtime contracts:

1. `NarrationInputEnvelopeSchema`
   - `ModelFacingNarrationRequestSchema`
   - `PrivateNarrationValidationContextSchema`
2. `PenelopeScenePlanSchema`
3. `PenelopeEnglishStyleProfileSchema`
4. `ModelNarrationOutputSchema`
5. `NarrationPipelineEnvelopeSchema`
6. `PenelopeNarrationPreflightReceiptSchema`

Shared registries and authority types are exported from
`src/contracts/narration-license.ts`: scene modes, sentence roles, speech acts,
license issuers/categories, `LicensedRenderingDetailSchema`, and
`TypedSpeechEventReferenceSchema`. Aggregate consumer exports for the main
request/output/envelope/style types are available from
`src/contracts/world-narrator.ts`.

Root-specific identifier semantics are preserved: input/output/envelope/scene
plan IDs are lowercase-only; style and preflight authority IDs allow uppercase
registry IDs such as `TT-01` and `FC-04`.

## Seam and migration truth

- Visible NPC reaction events already carry `observableSummary`; a reaction
  without it is not focal-visible. The analytic rule summary is therefore not
  intentionally routed into the renderer.
- The current runtime does not yet register a speech event kind. Lane A exposes
  only the typed reference contract. Event-kind registration belongs to Lane D.
- Legacy `WorldNarrationRequestSchema` and `WorldNarrationSchema` remain the
  only active runtime path and are now marked `@deprecated`. Their consumers
  must be rewired by Lane D before Lane A removes them. Single-runtime-authority
  completion is therefore still pending.
- Runtime Zod parsing rejects a dialogue receipt bound only to a general event.
  ID existence, speech-kind resolution, and `speech_act` license-category
  resolution remain Lane B deterministic-preflight responsibilities.
- `z.toJSONSchema()` / `zodTextFormat()` do not preserve Zod `superRefine` or
  runtime `uniqueItems` checks. Lane D must Zod-parse every model result and
  fail closed. Do not claim that provider-side Structured Outputs alone enforce
  AC-DLG-01, mode semantics, or duplicate-ID rejection.

## Verification

- Bundled schema oracle: JSON `8/8`, Draft 2020-12 metaschema `6/6`, behavior
  and exclusion checks `23/23 PASS`.
- Focused regression: `5 files / 43 tests PASS`.
- Full `npm run verify`: PASS.
  - evidence generation/verification: `7/7`
  - Vitest: `76 files / 603 tests`
  - privacy scan: `343 files`
  - production build: PASS
  - Next trace privacy: `18 manifests / 2428 files`
- TypeScript, ESLint, and `git diff --check`: PASS.

The bundled oracle contains T01–T23, not T01–T24. T01–T22 are contract behavior;
T23 is the Markdown/JSON exclusion-marker scan. Lane C must not invent T24 or
repeat the stale 24/24 claim.

## Remaining / handoff

- Lane C: mirror T01–T22 plus a separately named migration guard.
- Lane B: ID subset/existence/disjoint checks, full AC-DLG-01 resolution, and
  private/public validation.
- Lane D: register approved speech kinds/licenses, rewire the runtime, Zod
  post-parse model output, and coordinate legacy-export removal.
- Implementation commit: `b073be98a60685c513a334c8480aa5c515edebf8`.
- `/feedback`: no value written to tracked files; private submission recording
  remains a later release action.
