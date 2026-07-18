<!-- Penelope 내러티브 프롬프트 3층 양식 + 파이프라인 A/B 비교·추천 — 미기입 템플릿, 예문 0 (Fable pass 2, CREATOR REVIEW REQUIRED) -->
# PENELOPE-NARRATIVE-PROMPT-FORM

Status: `CANDIDATE / UNFILLED FORM / NO PROSE / CREATOR REVIEW REQUIRED`
Date: 2026-07-17

This document specifies the three-layer prompt structure, its serialization
rules, and the pipeline shape. It contains no finished sentence of scene
prose, no dialogue, and no example lines. `{{DOUBLE_BRACES}}` mark slots
filled at run time from validated artifacts only. The companion
`FABLE-NARRATIVE-PROMPT-FORM.md` carries the bare unfilled template; this file
is the specification that governs it.

## 1. Layer architecture

A completed prompt is assembled in exactly three layers, in this order. Each
layer serializes only from a named validated source; hand-written additions
are forbidden.

### Layer 1 — Invariant layer (facts, knowledge, causality, authority, privacy)

Serialized from: `PENELOPE-NARRATIVE-INPUT.schema.json#modelFacing` (never the
envelope, never `privateValidation`).

Contents, in fixed order:

1. Role frame: the model renders one scene from an already-resolved world; the
   supplied records are constraints to satisfy, not text to reuse.
2. `{{FOCAL_ACTOR}}` and `{{PRESENT_ACTORS_WITH_RENDER_DESCRIPTORS}}`
3. `{{VISIBLE_FACTS_RENDER_TEXT}}`
4. `{{RESOLVED_EVENTS_OBSERVABLE_TEXT}}` with their event IDs (IDs exist for
   the plan receipt only and are banned from prose — state this in the layer)
5. `{{AUTHORIZED_ANCHORS}}`
6. `{{LICENSED_RENDERING_DETAILS}}` with category and content boundary each
7. `{{RESERVED_ACTION_BOUNDARY}}`: reserved participant actions exist and may
   not be performed, previewed, or referenced (IDs withheld from the model —
   the deterministic post-validator owns the check; the prompt states only the
   prohibition class)
8. Privacy invariant: no knowledge, motive, emotion, prop, spatial relation,
   or speech act beyond the supplied records and licenses.

### Layer 2 — Resolved scene layer (this scene's contract)

Serialized from: the validated preflight receipt
(`FABLE-NARRATIVE-PREFLIGHT.schema.json`) and scene plan
(`PENELOPE-SENTENCE-HARNESS.schema.json`).

1. `{{SCENE_MODE}}` and its completion condition (from the mode registry —
   what this scene type must and must not accomplish)
2. `{{AUTHORIZED_ACTION_EVENT_IDS}}`, `{{AUTHORIZED_REACTION_EVENT_IDS}}`,
   `{{AUTHORIZED_CHANGE_EVENT_IDS}}` (empty lists serialize as an explicit
   "none authorized" clause — the model must know a change claim is illegal
   in this scene, not merely unmentioned)
3. `{{PLAIN_DRAMATIC_PLAN}}`: want/obstacle/change in plain terms, only the
   fields the preflight established, each with its authority binding
4. `{{DIALOGUE_AUTHORITY}}`: `none` (silence clause: absence of dialogue is
   correct and unremarkable) or `licensed` (speaker, speech act, content
   boundary, plain intent)
5. `{{SENTENCE_PLAN_TABLE}}`: the validated sentence plans — role, actor,
   bindings, plain function — which the prose must realize one-to-one.

### Layer 3 — Rendering layer (English levers, output schema, stop)

Serialized from: `PENELOPE-ENGLISH-STYLE-PROFILE.json` resolved through
`{{STYLE_STATE_ID}}`.

1. `{{RESOLVED_LEVER_BLOCK}}`: the effective lever values after state
   overrides (distribution targets marked advisory; ceilings marked hard)
2. `{{FORBIDDEN_CONSTRUCTION_BLOCK}}`: FC IDs with their detection criteria
   restated as prohibitions (criteria, never examples)
3. Output contract: return exactly `ModelNarrationOutput`
   (`planReceipt` + `readerProse`) per
   `PENELOPE-NARRATIVE-OUTPUT.schema.json`; prose paragraphs bind to sentence
   plan IDs; pipeline field names never appear inside prose
4. `{{ENDING_MODE}}`: the in-world stopping shape for this scene mode.

## 2. Serialization rules

- Analytic field names (`sceneMode`, `resolvedEvents`, `plainFunction`, …)
  appear only as machine keys in the request body; the natural-language
  portions of the prompt refer to them by neutral phrases ("this scene's
  records", "the allowed line of speech") so field vocabulary never becomes
  candidate prose diction (AC-SEP-02).
- Source wording from engine records never enters the prompt; only
  camera-safe fields do (AC-DATA-01..03).
- No few-shot examples of any kind may be attached (AC-SAMPLE-01). If a
  creator calibration excerpt exists, it is attached under its receipt ID in
  a clearly delimited block with an imitation prohibition — absent by default.
- The serialized prompt is itself an artifact: hashed, logged, and
  reproducible from its inputs.

## 3. Pipeline comparison and recommendation (cost and latency)

Two candidate structures were compared as required.

**A. deterministic preflight → one GPT-5.6 render → lint → human review**

- Cost: one model call per scene, always. Lint is free (deterministic).
- Behavior on warnings: warnings travel to human review unrepaired.
- Behavior on hard fail: fail closed, no retry spend.
- Weakness: every heuristic finding becomes creator workload; borderline
  scenes ship to review in their flawed form.

**B. deterministic preflight → one GPT-5.6 render → lint → critic call only
when warnings exist → human review**

- Cost: one call on clean scenes; at most two calls on flagged scenes. The
  critic receives the finding codes and the same three-layer contract, may
  only rewrite flagged sentences within the existing plan (no new authority),
  and its output is re-linted once. No third call exists.
- Behavior on hard fail: identical to A — fail closed before any critic.
- Behavior on persistent warnings: deliver flagged to human review; never
  loop.
- Expected quality difference: concentrated exactly where heuristics fire
  (register drift, forbidden constructions, restatement) — the cases where a
  bounded second pass is most reliable; structural and fidelity failures
  never reach the critic because they fail closed first.
- Additional token cost: bounded by (critic prompt ≈ render prompt + prose);
  incurred only on flagged scenes. With an unknown initial flag rate, the
  worst case is 2× per-scene cost; the expected case is well under that, and
  the rate is measurable from renderAudit warning counts once live.

**Recommendation: B**, because it never adds an unconditional second call
(the dispatch's explicit constraint), spends extra tokens only where a
finding exists, and converts heuristic findings into bounded repairs instead
of creator workload. Failure behavior is strictly fail-closed at every stage;
the critic can neither mint authority nor bypass the post-validator.

Both structures require: no drafting without a valid preflight receipt
(AC-REF-01), the deterministic post-validator with private context after
every model call (AC-PRIV-02, AC-FID-01), and creator review as the only
literary verdict (AC-HUMAN-01). Prose generation remains blocked until the
creator accepts this harness; the pipeline choice is design-ahead, not an
authorization to generate.
