# Build Week command center

Status snapshot: **2026-07-15 KST**
Current state: **Core fixture vertical slice and fresh-copy release rehearsal verified; live-model and external submission gates remain.**

Official submission deadline: **2026-07-22 09:00 KST** (2026-07-21 17:00 PDT).
Internal submission freeze: **2026-07-21 23:00 KST**. The final ten hours are emergency buffer, not feature time.

## Approved product proof

The Work & Productivity product serves professional GMs, narrative production teams, and game scenario or quest designers. It succeeds only if this vertical slice works end to end:

```text
facilitator-collected ParticipantIntent[] + creator-owned StyleProfile
+ World Pack / SimulationSnapshot
→ character-scoped retrieval and agent views
→ GPT-5.6 structured candidate
→ deterministic hard validation and intent lineage
→ derived canon/knowledge graph
→ creator accept/edit/reject
→ deterministic transition and next snapshot/hash
→ second step plus frozen replay
```

The primary demo is not “AI writes mythology” and not four unrelated error cards. It is one professional rehearsal flow:

1. Two locally labeled participants provide intents for Penelope and Telemachus while the facilitator selects an original table-ready mythic style profile. Penelope and Eurycleia remain a separate grounded replay control.
2. The tool builds separate character views; Penelope does not receive the hidden Ogygia edge.
3. GPT-5.6 returns attributed candidate utterances/actions and a red-sail rule proposal.
4. The audit graph exposes evidence, a blocked knowledge leak, and the proposal as a ghost relation.
5. The facilitator accepts or edits the rule; only then does the overlay hash change.
6. Two validated steps advance the registered `harbor_watch` variable from `idle` to `watching` to `signal_seen`.
7. The chained snapshots and state hashes change, while frozen Hector, knowledge-leak, and tradition-conflict cases retain their expected outcomes.

## Current truth

| Area | State | Evidence or gap |
|---|---|---|
| Build Week registration | verified | participant identity and eligible-country checks recorded privately |
| Devpost project page | verified, not submitted | public in-progress page exists; final submission remains incomplete |
| Codex credit request | resubmitted, pending | optional; the build assumes no credit |
| Scope decision | verified | user approved A scope, Work & Productivity audience expansion, and remote-multiplayer No-Go on 2026-07-15 |
| Local repository | verified working tree | core work is implemented on `codex/core-vertical-slice`; final commit/public remote remain |
| Core contracts and deterministic engine | verified | 13 contract groups plus retrieval, validation, overlay, graph, simulation, and replay tests |
| Table product surface | verified fixture-only | two local intents, style profile, graph, accept/edit/reject, S0r, two steps, and replay are visible without JSON editing |
| Local release gate | verified | evidence generation, lint, typecheck, 77 tests, privacy scan, production build, and 6 browser tests pass |
| Fresh-copy rehearsal | verified | clean copy `npm ci`, vulnerability audit 0, full release gate PASS |
| Live GPT-5.6 | adapter verified; real call blocked | strict Responses adapter and typed errors are mock-tested; no API key/live response evidence exists |
| Quest production extension | target only | no `QuestSpec`, linter, generator, evaluation, or user proof exists |
| Release evidence | fixture packet verified; external release pending | six sanitized evidence artifacts plus manifest exist; README is blocked by stale skill manifest; public remote, CI, deployment, video, `/feedback`, and final submission remain |

Passing fixture and fresh-copy checks proves the bounded local product path and its deterministic invariants. It does not prove live model use, quest support, user productivity, hosted reviewer access, or final submission.

## Critical path

### Gate 0 — Lock eight contract groups

**Status: PASS.** Contracts, malformed-input tests, structured fixtures, and hash rules are implemented.

Lock speaker- and style-bound output, typed rule/claim proposals, typed model outcomes, immutable base plus overlay authority, executable replay fixtures, participant/character identity, deterministic graph descriptors, and separate World State/Simulation Scenario/Simulation State contracts.

The simulation contract must include the finite `harbor_watch: idle → watching → signal_seen` scenario, `set_variable` actions, `turnIndex`, overlay hash, state hash, two-transition hash chaining, `maxSteps: 2`, and unchanged-state behavior for blocked/rejected/stale input. `RunRequest.intent` becomes `taskType`; participant intents carry stable IDs, and each generated utterance/action has one authorizing intent plus optional non-authorizing contributing intents. Style profiles contain stable constraint IDs; subjective style remains an explicitly human judgment rather than deterministic hard truth.

**Go:** failing tests exist for all eight groups, then strict schemas make them pass.
**No-Go:** start retrieval, UI, or live API work while any approved behavior is unrepresentable.

### Gate 1 — Deterministic core and graph projection

**Status: PASS.** Character views, retrieval, hard validation, graph projection, alias-boundary regression, and five replay controls are verified.

Implement pack loading, initial snapshot derivation, canonical serialization, participant ownership validation, character agent views, stable retrieval, hard validators, fixture orchestration, and the facilitator-facing canon/knowledge graph descriptor.

**Go:** deterministic retrieval and graph JSON are byte-identical across 100 runs; duplicate control, unknown lineage, unauthorized speaker/action, and unknown style-constraint IDs fail; five frozen cases have exact outcomes; Penelope's model view excludes the hidden Ogygia edge.
**No-Go:** move errors into prompts, expose facilitator-only truth to the model, or call the derived graph a database or formal ontology.

### Gate 2 — Creator-controlled canon and real two-step transition

**Status: PASS.** Accept/edit/reject, stale behavior, rebase, continuous two-step hashes, and blocked third step are verified.

Implement accept/edit/reject, stale-decision rejection, additive overlay, same-turn snapshot rebase, registered state-variable validation, deterministic transition, snapshot hashing, and the two-step red-sail scenario.

**Go:** proposal/reject/stale/blocked leave overlay, turn, variables, and state hash unchanged; safe accept/edit returns overlay vNext and a matching rebased snapshot without consuming a turn; two validated steps produce `idle → watching → signal_seen` and a continuous hash chain; unchanged controls retain their outcomes and the red-sail v0/v1 result matches its explicit expectation.
**No-Go:** treat an overlay-only rerun as simulation. If this gate is not green by Jul 17, remove the public simulation claim and ship a before/after canon rehearsal.

### Gate 3 — Live GPT-5.6 and Table product surface

**Status: PARTIAL.** Table surface and browser smoke pass; the live adapter is mock-tested, but the required real GPT-5.6 trace is blocked by missing credentials.

Connect the Responses API using strict `text.format` Structured Outputs, keep refusals distinct from schema errors, expose the run path, and build the single-page Table flow with multi-intent input, selected style profile, graph view, creator decision, state timeline, and replay panel.

The public deployment is fixture-only. Live mode is enabled only in a controlled local/server process with `OPENAI_API_KEY` and an explicit flag. Live model text is nondeterministic; only selected structured-output processing, validators, graph descriptors, transitions, and fixture replay carry deterministic claims.

**Go:** one sanitized real GPT-5.6 trace is verified; fixture/live identities cannot cross; the facilitator completes both steps without editing JSON; browser smoke passes.
**No-Go:** label fixture output as live, expose a paid unauthenticated route, or show participant/character identity as if it were actual remote collaboration.

### Gate 4 — Evidence and release

**Status: PARTIAL.** Source/privacy checks, fixture Evidence Packet, production build, and fresh-copy rehearsal pass. README manifest refresh, public remote/CI/deploy, video, `/feedback`, and final Devpost confirmation remain.

Run frozen evaluation, publish sanitized evidence, build the Evidence Packet, and derive README, Devpost copy, video claims, and later portfolio copy from the same claim ledger.

**Go:** fresh clone, CI, hosted demo, source-rights check, privacy/path/secret scan, claim parity, public video, `/feedback` ID, and final Devpost confirmation pass.
**No-Go:** call code completion “finished” before reviewer access and submission evidence exist.

## Date plan

| KST date | Deliverable | Stop condition |
|---|---|---|
| Jul 15 | Gate 0 contracts, failure tests, source/rights closure | participant lineage, graph projection, or state transition cannot be represented |
| Jul 16 | retrieval, ownership validation, hard validators, graph descriptor, fixture orchestrator | deterministic core or five frozen cases fail |
| Jul 17 | creator gate, overlay hash, real transition, two-step replay | an invalid decision changes state or no registered variable changes |
| Jul 18 | live GPT-5.6 adapter, typed errors, run API | no real model evidence or strict-output/error handling |
| Jul 19 | Table UI, graph, state timeline, browser smoke, public repo, CI, hosted demo | facilitator must edit JSON or reviewer cannot run it |
| Jul 20 | feature freeze at 09:00, then frozen evaluation, Evidence Packet, README, fresh-clone and video rehearsal | public claims drift or a source/privacy gate remains open |
| Jul 21 | practitioner test, final video, `/feedback`, Devpost fields, submit by 23:00 KST | any required field or live link is unverified |
| Jul 22 before 09:00 | emergency verification only | no new features |

## Scope freeze and early-finish ladder

Included now:

- local facilitator-collected multi-intent composition
- original creator-owned style profile applied as an explicit harness layer
- derived canon/knowledge graph view
- deterministic two-step state simulation

Excluded from submission:

- graph databases and embeddings
- login, presence, synchronized remote rooms, or shared canon editing
- long-running autonomous simulation, agent society, or persistent memory
- generalized ontology editing or quest generation

“Finished early” means Gates 0–4, live evidence, deploy, fresh clone, privacy/source checks, and release rehearsal all pass with at least 12 hours of buffer. Then apply this order:

1. intent/action lineage, graph before/after diff, state-hash timeline, accessibility, and clearer evidence links
2. run a same-model unbounded-versus-style-profile ablation with objective checks and a labeled human rubric; make no Fable/Opus superiority claim
3. expand replay and malformed/stale/duplicate-control tests; run one to three practitioner task tests if available
4. add a bounded Quest Consistency Linter pilot with `QuestSpec` and three seeded faults
5. add Quest Brief export only after the linter passes
6. visual polish last

Remote multiplayer, graph DB, embeddings, and long-horizon simulation do not reopen automatically.

## Codex task boundary

The core was built in this public-safe task on `codex/core-vertical-slice` using `_dev/CORE-BUILD-DISPATCH.md`. Private planning conversation and personal paths remain outside source. `/feedback` is now an external submission action: store its ID only in a gitignored private record and Devpost.

## Portfolio asset path

The portfolio case study is derived only after Gate 4 produces a verified Evidence Packet. The target positioning is:

> Translated narrative voice, canon, source traditions, character knowledge, participant intent, creator approval, and world-state transitions into a testable production harness with a bounded GPT-5.6 adapter—instead of relying on a model's default prose.

The defensible writing angle is not “Codex or GPT-5.6 beats Fable or Opus at prose.” It is that a perceived default-writing weakness becomes an engineering surface: original style constraints are explicit, character knowledge is scoped, world claims are checked, new lore requires creator approval, and the same fixture replays after change. Raw taste remains human judgment; controllability and regression become testable.

The next credible game-production step is **Quest Consistency Linter & Replay**, followed by a harnessed quest-candidate generator. User adoption, productivity gains, quest automation, creativity improvement, and production readiness remain unmeasured until their own evidence exists.

## External authority

- [OpenAI Build Week overview](https://openai.devpost.com/)
- [OpenAI Build Week official rules](https://openai.devpost.com/rules)
- [OpenAI GPT-5.6 model guidance](https://developers.openai.com/api/docs/guides/latest-model)
- [OpenAI Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs)
