# MVP scope and deadline plan

The user approved the attack-balanced A scope on **2026-07-15 KST**. The schedule is organized around one visible professional workflow, not feature count. Official submission closes **2026-07-22 09:00 KST**; feature freeze is **2026-07-20 09:00 KST** and the internal submit target is **2026-07-21 23:00 KST**.

## Approved submission scope

- a registered frozen two-intent public rehearsal plus a gated facilitator-collected `ParticipantIntent[]` live boundary, with participant, controlled character, and generated speaker identities kept separate
- an original creator-owned `StyleProfile` supplied alongside character-scoped evidence
- deterministic character-scoped retrieval and hard validation
- GPT-5.6 Responses Structured Output
- creator accept/edit/reject against a versioned canon overlay
- derived canon/knowledge graph view from typed JSON
- a real deterministic two-step finite-state simulation (`idle → watching → signal_seen`) with chained snapshots and hashes
- frozen replay before and after an approved change
- fixture-only public demo plus a separate, still-open live GPT-5.6 evidence gate

The fixture proves lineage and control flow for its registered pair; it does not prove arbitrary free-text composition. That claim opens only after a sanitized live run.

Actual remote multiplayer, graph databases, embeddings, and long-running autonomous simulation are not submission features.

## Date plan

| KST date | Deliverable | Done gate |
|---|---|---|
| Jul 15 | Lock participant/speaker/style, rule patch, typed outcome, overlay authority, replay, graph descriptor, and simulation contracts | all approved behavior is representable in failing then passing contract tests |
| Jul 16 | Deterministic retrieval, intent ownership validation, hard validators, fixture orchestrator, graph descriptor | byte-stable retrieval/graph JSON; five frozen cases produce exact outcomes |
| Jul 17 | Creator accept/edit/reject, overlay hashes, same-turn snapshot rebase, deterministic transition, two-step snapshot replay | blocked/rejected/stale inputs do not change state; valid accept returns matching overlay/snapshot authorities without consuming a simulation turn |
| Jul 18 | GPT-5.6 Responses adapter and run API | real request produces a strict draft; refusal/error paths tested and sanitized |
| Jul 19 | Table UI, canon/knowledge graph, two-step flow, browser smoke, public repo, CI, hosted fixture demo | facilitator completes the primary flow without editing JSON |
| Jul 20 | Feature freeze at 09:00, then frozen evaluation, Evidence Packet, README, fresh-clone and video rehearsal | claims match evidence; privacy and source gates pass |
| Jul 21 | Practitioner test, final video, `/feedback`, Devpost package and submit | required links verified; submitted by 23:00 KST |
| Jul 22 | Emergency verification before 09:00 KST | no new features |

## Kill gates

- If the two chained transitions and snapshot-hash contract are not green by Jul 17, remove the public word `simulation` and ship an honestly named before/after canon rehearsal.
- If multi-intent UI exceeds eight hours, reduce three participant cards to two; do not remove the participant/character identity contract.
- If the graph view exceeds ten hours, remove animation and interaction but retain the deterministic static descriptor and SVG view.
- Never trade validator, creator-gate, replay, live evidence, browser smoke, or submission completeness for a stretch feature.

## Early-finish development ladder

Finishing code early does not automatically authorize new infrastructure. A stretch step opens only after the current vertical slice passes `npm run verify`, browser smoke, privacy scan, fixture replay, one sanitized live run, and claim-ledger update with at least **12 hours of release buffer** remaining.

1. **Evidence and usability depth** — improve error explanations, accessibility, empty/error states, replay report, and conduct one to three practitioner task tests.
2. **Style-harness ablation** — run the same model, brief, evidence, schema, and reasoning setting in preregistered AB/BA order; change only the selected original style bundle between `default_instruction_control` and `profiled`. Measure objective constraints automatically and use a condition-masked creator rubric for voice/cadence. Do not turn this into a cross-model superiority claim.
3. **Quest Consistency Linter pilot** — add a small `QuestSpec` contract and three seeded faults: impossible precondition, invalid NPC state/knowledge, and unapproved canon dependency. This is quest-design QA, not automatic quest generation.
4. **Quest Brief export** — only if the linter passes, derive a structured brief containing objectives, preconditions, steps, effects, failure states, knowledge requirements, and canon proposals.
5. **Presentation polish** — improve graph transitions and two-step diff visualization after evidence-producing features are stable.

Remote multiplayer and long-horizon simulation remain post-submission work even if the core finishes early.

## Revisit triggers

- embeddings: deterministic retrieval misses required claims on a representative multi-pack set
- graph DB: JSON traversal becomes a measured bottleneck or authoring integrity cannot be maintained
- server database and remote collaboration: multiple creators need shared canon, authorization, and conflict handling
- quest generation: the Quest Consistency Linter and Quest Brief contract pass representative fixtures and a practitioner requests candidate generation
- long simulation: bounded transition/replay is stable and a long-horizon evaluation protocol exists

The detailed current-state matrix and gate definitions live in [`BUILD-WEEK-COMMAND-CENTER.md`](./BUILD-WEEK-COMMAND-CENTER.md).
