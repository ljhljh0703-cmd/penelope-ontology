<!-- 미기입 프롬프트 템플릿 원본 — 슬롯만 존재, 완성 문장·예문·장면 0 (Fable pass 2, CREATOR REVIEW REQUIRED) -->
# FABLE-NARRATIVE-PROMPT-FORM

Status: `CANDIDATE / UNFILLED TEMPLATE ONLY / CREATOR REVIEW REQUIRED`
Date: 2026-07-17

This is the bare unfilled template governed by
`PENELOPE-NARRATIVE-PROMPT-FORM.md`. Slots are `{{DOUBLE_BRACES}}`; every slot
is filled mechanically from a named validated artifact. No slot may be filled
by hand, no example filling is provided, and no scene prose, dialogue line, or
example correction pair exists in this pass. Drafting with this template is
blocked until creator acceptance (AC-REF-01, AC-HUMAN-01).

```text
=== LAYER 1 : INVARIANT ===
[ROLE_FRAME]
You render one scene from a world that is already resolved. Every record
below is a constraint to satisfy, not text to reuse. You may not invent or
alter any event, motive, emotion, relationship, identity, prop, spatial
relation, knowledge, or act of speech.

[FOCAL]
{{FOCAL_ACTOR}}

[PRESENT_ACTORS]
{{PRESENT_ACTORS_WITH_RENDER_DESCRIPTORS}}

[VISIBLE_FACTS]
{{VISIBLE_FACTS_RENDER_TEXT}}

[RESOLVED_EVENTS]
{{RESOLVED_EVENTS_OBSERVABLE_TEXT}}

[ANCHORS]
{{AUTHORIZED_ANCHORS}}

[LICENSES]
{{LICENSED_RENDERING_DETAILS}}

[RESERVED_BOUNDARY]
{{RESERVED_ACTION_BOUNDARY}}

[PRIVACY_INVARIANT]
Nothing beyond the records and licenses above exists for you.

=== LAYER 2 : RESOLVED SCENE ===
[SCENE_MODE_CONTRACT]
{{SCENE_MODE}} — {{SCENE_MODE_COMPLETION_CONDITION}}

[AUTHORIZED_BEATS]
action: {{AUTHORIZED_ACTION_EVENT_IDS_OR_NONE}}
reaction: {{AUTHORIZED_REACTION_EVENT_IDS_OR_NONE}}
change: {{AUTHORIZED_CHANGE_EVENT_IDS_OR_NONE}}

[PLAIN_DRAMATIC_PLAN]
{{PLAIN_DRAMATIC_PLAN_FIELDS_PRESENT_ONLY}}

[DIALOGUE_AUTHORITY]
{{DIALOGUE_MODE_NONE_OR_LICENSED_BLOCK}}

[SENTENCE_PLANS]
{{SENTENCE_PLAN_TABLE}}

=== LAYER 3 : RENDERING ===
[STYLE_LEVERS_EFFECTIVE]
{{RESOLVED_LEVER_BLOCK}}

[FORBIDDEN_CONSTRUCTIONS]
{{FORBIDDEN_CONSTRUCTION_BLOCK}}

[OUTPUT_CONTRACT]
Return exactly the structured object required by the supplied JSON schema:
planReceipt binding each sentence plan to its sources, and readerProse whose
paragraphs bind to sentence plan IDs. No schema field name, record ID, or
system vocabulary may appear inside the prose text.

[STOP_SHAPE]
{{ENDING_MODE_FOR_THIS_SCENE}}
```

Slot sources: Layer 1 ← `PENELOPE-NARRATIVE-INPUT.schema.json#modelFacing`;
Layer 2 ← validated `FABLE-NARRATIVE-PREFLIGHT.schema.json` receipt +
`PENELOPE-SENTENCE-HARNESS.schema.json` plan; Layer 3 ←
`PENELOPE-ENGLISH-STYLE-PROFILE.json` resolved through `styleStateId`, output
per `PENELOPE-NARRATIVE-OUTPUT.schema.json`. Enforcement and severities:
`FABLE-NARRATIVE-AUTHORITY-CONTRACT.json`.
