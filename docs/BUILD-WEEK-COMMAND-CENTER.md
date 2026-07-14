# Build Week command center

Status snapshot: **2026-07-15 KST**
Current state: **Core fixture vertical slice, frozen-input truthfulness, registered-request authority, creator/style/knowledge audit surfaces, live-capture transaction, exact-SHA clean-clone rehearsal, local deployment smoke, and production visual inspection verified; live-model and external submission gates remain.**

Official submission deadline: **2026-07-22 09:00 KST** (2026-07-21 17:00 PDT).
Internal submission freeze: **2026-07-21 23:00 KST**. The final ten hours are emergency buffer, not feature time.

## Approved product proof

The Work & Productivity product serves professional GMs, narrative production teams, and game scene or quest designers. It succeeds only if this vertical slice works end to end:

```text
registered frozen ParticipantIntent[2] fixture / gated facilitator-collected live intents
+ creator-owned StyleProfile
+ World Pack / SimulationSnapshot
→ character-scoped retrieval and agent views
→ fixture-verified structured candidate / gated GPT-5.6 candidate
→ deterministic hard validation and intent lineage
→ derived canon/knowledge graph
→ creator accept/edit/reject
→ deterministic transition and next snapshot/hash
→ second step plus frozen replay
```

The primary demo is not “AI writes mythology” and not four unrelated error cards. It is one professional rehearsal flow:

1. The public workbench loads a registered, frozen pair of synthetic intents for Penelope and Telemachus plus an original table-ready mythic style profile. It does not pretend the fixture reacts to arbitrary prompt prose. Penelope and Eurycleia remain a separate grounded replay control.
2. The tool builds separate character views; Penelope does not receive the hidden Ogygia edge.
3. The verified fixture returns a playable line for each intent, reciprocal contributing lineage, and a red-sail rule proposal through the same strict draft contract used by the gated GPT-5.6 adapter. A real arbitrary-intent model result remains a separate gate.
4. The workbench exposes a style receipt, a compact knowledge-boundary table, evidence, a blocked leak, and the proposal as a ghost relation before the detailed graph.
5. The facilitator accepts or edits the rule; only then does the overlay hash change.
6. Two validated steps advance the registered `harbor_watch` variable from `idle` to `watching` to `signal_seen`.
7. The chained snapshots and state hashes change, while frozen Hector, knowledge-leak, and tradition-conflict cases retain their expected outcomes; a collapsed production review packet organizes the fixture evidence for human handoff.

## Current truth

| Area | State | Evidence or gap |
|---|---|---|
| Build Week registration | verified | participant identity and eligible-country checks recorded privately |
| Devpost project page | verified, not submitted | public in-progress page exists; final submission remains incomplete |
| Codex credit request | resubmitted, pending | optional; the build assumes no credit |
| Scope decision | verified | user approved A scope, Work & Productivity audience expansion, and remote-multiplayer No-Go on 2026-07-15 |
| Local repository | verified clean candidate | core work is committed on `codex/core-vertical-slice`; public remote remains |
| Core contracts and deterministic engine | verified | eight demo-critical contract groups plus retrieval, validation, registered public-fixture authority, overlay, graph, simulation, exact-overlay replay, and transition-authority tests |
| Table product surface | verified fixture-only | registered frozen two-intent lineage, visible style receipt and knowledge boundary, creator gate before the collapsed graph, production review packet, fresh 4/4 approved-overlay replay, S0r, and two steps are visible without JSON editing |
| Current-tree release gate | verified | seven-file evidence manifest, lint, non-incremental typecheck, 30 Vitest files / 156 tests, privacy scan, production build, and 10 production-browser checks pass |
| Production visual inspection | verified local candidate | desktop candidate, mobile candidate, and desktop completed flow show frozen inputs, knowledge table, style receipt, creator gate before graph, two-step chain, and opened review packet without overlap or clipped controls |
| Fresh-copy rehearsal | verified local candidate | a clean clone installed 395 packages with zero audit vulnerabilities and passed evidence, lint, typecheck, 30/156 Vitest, privacy, identified production build, and 10 browser checks; post-commit authority is kept in the ignored release record |
| Deployment smoke | verified local candidate | current repository and clean-clone production servers both passed cache-busted exact-SHA identity, security-header, health, fixture authority, approved-overlay replay, two-step transition, and public-live denial; hosted origin remains pending |
| Live GPT-5.6 | adapter and capture transaction verified; real call blocked | strict Responses adapter, typed errors, `.env.local` loading, pre-dispatch recovery sentinel, exclusive lock, append-only receipts, atomic raw/public writes, completed-receipt readiness binding, rollback, and explicit retry are tested; no API key/live response evidence exists |
| Style controllability probe | protocol verified; live result blocked | same-model AB/BA schedule, no-retry capture, masked rubric, integrity hashes, and the focused style-evaluation suite pass; four live calls and creator ratings do not exist |
| Quest production extension | target only | no `QuestSpec`, linter, generator, evaluation, or user proof exists |
| Release evidence | fixture packet verified; external release pending | seven sanitized evidence artifacts plus manifest exist; README write/derive preflights are `SERVING_CANDIDATE` and require explicit approval; public remote, CI, deployment, video, `/feedback`, and final submission remain |

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

**Go:** deterministic retrieval JSON is byte-identical across 100 repeated runs, and graph JSON is byte-stable across repeated identical inputs; duplicate control, unknown lineage, unauthorized speaker/action, and unknown style-constraint IDs fail; five frozen cases have exact outcomes; Penelope's model view excludes the hidden Ogygia edge.
**No-Go:** move errors into prompts, expose facilitator-only truth to the model, or call the derived graph a database or formal ontology.

### Gate 2 — Creator-controlled canon and real two-step transition

**Status: PASS.** Accept/edit/reject, stale behavior, semantic-edit locking, separate human audit labels, exact-overlay safety replay, server-rederived transition authority, continuous two-step hashes, forged-overlay rejection, and blocked third step are verified.

Implement accept/edit/reject, stale-decision rejection, additive overlay, same-turn snapshot rebase, registered state-variable validation, deterministic transition, snapshot hashing, and the two-step red-sail scenario.

**Go:** proposal/reject/stale/blocked leave overlay, turn, variables, and state hash unchanged; safe accept/edit returns overlay vNext, a matching rebased snapshot, and a fresh four-control replay bound to the exact approved hash without consuming a turn; display editing cannot mutate or conceal the semantic rule used by transitions; transition endpoints reconstruct the registered decision instead of trusting client canon; two validated steps produce `idle → watching → signal_seen` and a continuous hash chain; forged overlays and skipped snapshot authorities fail.
**No-Go:** treat an overlay-only rerun as simulation. If this gate is not green by Jul 17, remove the public simulation claim and ship a before/after canon rehearsal.

### Gate 3 — Live GPT-5.6 and Table product surface

**Status: PARTIAL.** The frozen Table surface, 10 desktop/mobile production-browser checks, and current-tree production build pass; the live adapter and capture transaction are tested, but the required real GPT-5.6 trace is blocked by missing credentials.

Connect the Responses API using strict `text.format` Structured Outputs, keep refusals distinct from schema errors, expose the gated live run path, and build the single-page Table flow around a registered frozen two-intent fixture, selected style profile, visible style and knowledge receipts, graph view, creator decision, state timeline, review packet, and replay panel. Arbitrary free-text inputs are not exposed by the fixture surface.

The public route and reviewer deployment are fixture-only. Every public `modelMode: live` request is rejected before orchestration. A real model call is available only through an explicitly invoked local evidence command with `OPENAI_API_KEY` and an enable flag. Live model text is nondeterministic; only selected structured-output processing, validators, graph descriptors, transitions, and fixture replay carry deterministic claims.

**Go:** one sanitized real GPT-5.6 trace is verified; fixture/live identities cannot cross; the facilitator completes both steps without editing JSON; browser smoke passes.
**No-Go:** label fixture output as live, expose a paid unauthenticated route, or show participant/character identity as if it were actual remote collaboration.

### Gate 4 — Evidence and release

**Status: PARTIAL.** Current source/privacy checks, fixture Evidence Packet, identified clean-clone build, browser checks, local deployment smoke, and visual inspection pass. README approval, public remote/CI/hosted deployment, video, `/feedback`, and Devpost confirmation remain.

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

- registered frozen two-intent fixture with explicit lineage; arbitrary facilitator-collected composition remains at the gated live boundary
- original creator-owned style profile carried as a registered harness input and referenced through stable IDs; one deterministic bound is checked while six constraints remain creator-reviewed
- derived canon/knowledge graph view
- deterministic two-step state simulation

Excluded from submission:

- graph databases and embeddings
- login, presence, synchronized remote rooms, or shared canon editing
- long-running autonomous simulation, agent society, or persistent memory
- generalized ontology editing or quest generation

“Finished early” means Gates 0–4, live evidence, deploy, fresh clone, privacy/source checks, and release rehearsal all pass with at least 12 hours of buffer. Then apply this order:

1. intent/action lineage, graph before/after diff, state-hash timeline, accessibility, and clearer evidence links
2. run the preregistered same-model `default_instruction_control` versus `profiled` AB/BA probe with objective checks and a condition-masked creator rubric; make no Fable/Opus superiority claim
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

The defensible writing angle is not “Codex or GPT-5.6 beats Fable or Opus at prose.” The project turns familiar skepticism about generic default Codex prose into the brief: move voice and world coherence out of model personality and into a creator-owned production contract. Codex served as the engineering partner that converted tacit writing standards into explicit style, world, evidence, approval, and replay layers. Character knowledge is scoped, world claims are checked, new lore requires creator approval, semantic rules cannot hide behind edited presentation copy, and the same fixture replays after change. The model proposes, the harness constrains and traces, and the creator decides. Raw taste remains human judgment; the mechanism and its regressions become auditable.

Portfolio copy is not yet derived. The `portfolio-refiner` refine preflight is `SERVING_STALE`, so its canonical feedback stack was not loaded; the public README path independently remains `SERVING_CANDIDATE` pending explicit approval. `juhyeong-voice` was not read or applied.

The next credible game-production step is **Quest Consistency Linter & Replay**, followed by a harnessed quest-candidate generator. User adoption, productivity gains, quest automation, creativity improvement, and production readiness remain unmeasured until their own evidence exists.

## External authority

- [OpenAI Build Week overview](https://openai.devpost.com/)
- [OpenAI Build Week official rules](https://openai.devpost.com/rules)
- [OpenAI GPT-5.6 model guidance](https://developers.openai.com/api/docs/guides/latest-model)
- [OpenAI Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs)
