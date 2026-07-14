# Clean core-build dispatch

Use this file as the complete starting packet for a new Codex task. The task must contain no private world, personal knowledge-base content, employment context, or prior conversation transcript.

## Objective

Implement the user-approved A-scope vertical slice:

```text
facilitator-collected ParticipantIntent[] + creator-owned StyleProfile
+ World Pack / current SimulationSnapshot
→ character-scoped deterministic retrieval
→ GPT-5.6 Responses Structured Output
→ hard validation and intent lineage
→ derived canon/knowledge graph descriptor
→ creator accept/edit/reject
→ deterministic state transition and snapshot/hash
→ second step plus frozen replay
```

Primary users are professional GMs, narrative production teams, and game scenario or quest designers. The existing app shell, contracts, fixture data, documents, and tests are groundwork, not evidence that this flow already works.

## Phase 0: contract lock

Do not start retrieval, UI, or live API implementation until failing tests expose and the schemas close these eight contract groups:

1. **Speaker- and style-bound model output.** `ModelDraft` includes `styleProfileId`, `mentionedEntityIds`, and `appliedStyleConstraintIds`. Every style constraint is a stable `{ id, kind, value, checkMode }` record, and every reported ID must exist in the selected profile. Utterances and actions carry exactly one `authorizingIntentId` plus optional unique `contributingIntentIds`; utterances identify `speakerId`, actions identify `actorEntityId`, and contributing intents never confer control authority. Registered prose aliases must match `mentionedEntityIds`.
2. **Typed proposal patches.** Replace claim-only expansion with a discriminated `ProposalPatch` supporting `add_claim` and `add_rule`. The red-sail rule must be representable.
3. **Typed model outcomes.** Distinguish `completed`, `refused`, `timeout`, `api_error`, `configuration_error`, and `schema_error`.
4. **One overlay authority.** Keep the base World Pack immutable. Migrate `creator_canon.v0` to stable layer ID `creator_canon`, remove `states[].canonVersion`, and accept one complete validated overlay rather than duplicate canon fields. Proposals carry their base overlay version/hash and proposal hash; stale decisions fail. A valid accept/edit returns overlay vNext plus a same-turn, same-variable rebased snapshot with matching overlay/canon references and a new state hash; the rebase is not a simulation step.
5. **Executable replay fixtures.** Each replay case references a structured draft fixture and defines exact expectations. The full red-sail replay is proposal run on v0/S0 → creator decision and rebase to v1/S0r → Step 1 input/result → Step 2 input/result. Unchanged controls retain exact outcomes; the red-sail case declares its intentional v0/v1 difference. Fixture behavior never branches on prompt prose.
6. **Participant and character identity.** Add `ParticipantIntent { intentId, participantId, controlledEntityIds, intent }`; rename request `intent` to `taskType`. Derive focal characters from the union of `controlledEntityIds` instead of accepting a second authority. Reject duplicate participant or intent IDs, overlapping controlled characters, unknown controlled entities, unknown lineage IDs, and utterances/actions whose one authorizing intent does not control the speaker/actor.
7. **Derived graph descriptor.** Define strict, stably ordered graph nodes/edges and visual states for evidence, character visibility, conflicts, proposals, approvals, and snapshots. Keep the model-facing `agent_view` separate from the facilitator-facing audit graph.
8. **Real bounded state transition.** Separate immutable `WorldState`, immutable `SimulationScenario`, and session `SimulationState`. Add the `harbor_watch` finite variable with `idle → watching → signal_seen`, `set_variable` candidate actions, `SimulationSnapshot`, canonical state hashing, transition chaining, and `maxSteps: 2`. Blocked, rejected, unapproved, unauthorized, stale, or third-step input leaves turn and state hash unchanged.

Gate: malformed-input and invariant tests exist for all eight groups, then the schemas make them pass.

## Required outputs

1. World Pack loader, canonical serializer, deterministic character-scoped retrieval, and stable evidence bundle.
2. Participant-intent normalization, authorizing/contributing lineage validation, and bounded creator-owned style-profile input with stable constraint IDs.
3. Fixture provider plus live GPT-5.6 adapter using `text.format` strict JSON schema.
4. Typed refusal, timeout, API, configuration, and schema-error paths.
5. Hard validators for unknown entity, invalid/deceased state, time, fixed-state presence, character knowledge, inactive or conflicting tradition, unsupported claim, unapproved expansion, unauthorized speaker/action, and invalid state variable.
6. Deterministic canon/knowledge graph descriptor plus a static SVG or equivalent browser view. No graph database.
7. Creator accept/edit/reject against a base overlay version/hash, with deterministic canon hash, stale-decision rejection, and same-turn snapshot rebase.
8. Deterministic `SimulationScenario + SimulationState → validated action batch → transition → SimulationSnapshot` behavior across two chained steps.
9. One-page Table UI that replaces the stale Day-0 page title and validator-only copy, collects two or three participant intents, and runs the red-sail proposal/approval/next-state flow. Living-Hector, Penelope knowledge leak, and Helen conflict remain visible replay evidence.
10. Frozen proposal/decision-rebase/Step-1/Step-2 replay, unchanged-control comparisons, and sanitized fixture/live/graph/simulation evidence artifacts.
11. Unit, integration, replay, transition, and browser smoke tests.

Implementation order after Phase 0:

```text
World Pack, StyleProfile, SimulationScenario, and initial snapshot loaders
→ participant intent normalization and character agent views
→ deterministic retrieval and hard validators
→ fixture orchestrator and graph descriptor
→ creator decision and overlay
→ state transition, snapshot hashing, and two-step replay
→ live GPT-5.6 adapter
→ run API and one-page Table UI
```

## Constraints

- Use the existing Next.js/TypeScript stack.
- Use GPT-5.6 through the Responses API. Start with `gpt-5.6`, `reasoning.effort: medium`, and Structured Outputs.
- GPT-5.6 output is nondeterministic. Determinism claims apply only to retrieval, validation, selected structured-draft processing, graph descriptors, transitions, hashes, and fixture replay.
- Do not add function calling, PTC, graph DB, embeddings, authentication, remote collaboration, multi-agent runtime, general-purpose editing, persistent agent memory, or long-running autonomous simulation.
- The local Table UI may collect multiple participant intents. Never call it an online room or actual multi-user collaboration.
- Style profiles are original creator constraints, not living-author imitation. Do not claim that Codex, GPT-5.6, Fable, Opus, or another model is the superior writer without a controlled human evaluation.
- Do not create the public README until the implemented Evidence Packet exists and the evidence skill's write-mode preflight passes.
- Never call fixture output live GPT-5.6 evidence.
- Never let blocked output, an unauthorized action, or an unapproved/rejected/stale proposal update canon or simulation state.
- Keep raw prompts, keys, personal paths, private session details, and `/feedback` IDs out of Git.
- Treat the base World Pack and its `WorldState` records as immutable. Session changes live in `SimulationSnapshot`; approved creator changes live in overlay data.
- The model receives only per-character `agent_view` evidence, never hidden `true_state` or facilitator-only graph edges.
- Define `location_path_missing` narrowly: an actor is absent from the selected fixed state's `presentEntityIds`. Do not add a travel graph.
- The only MVP state action is `set_variable` against a transition registered in the selected `SimulationScenario`. Do not build a generic scripting engine.
- Deploy fixture mode publicly. Live mode requires both a server-side key and an explicit local/server flag; an unauthenticated public route rejects live mode before any model call.
- Write sanitized public evidence to `artifacts/evidence/`; keep raw live records under ignored `artifacts/live/`.

## Test invariants

- same deterministic input → byte-stable retrieval, graph descriptor, transition result, and fixture replay JSON
- live GPT-5.6 wording is never claimed to be byte-stable
- duplicate participant/intent IDs or overlapping controlled characters → rejected
- every utterance/action has one existing `authorizingIntentId`; its `speakerId` or `actorEntityId` is controlled by that intent; optional `contributingIntentIds` exist, are unique, and confer no authority
- every `appliedStyleConstraintId` exists in the selected `styleProfileId`; unknown, duplicate, or cross-profile IDs fail
- registered entity aliases in prose → matching `mentionedEntityIds`
- Penelope's model-facing view contains no Ogygia exact-location edge
- unregistered entity → `entity_unknown`
- Hector alive in the Ithaca state → blocked
- Penelope asserts the Ogygia fact → `belief_scope_violation`
- both Helen traditions active without a resolution → creator decision
- claim or rule from an inactive layer → `tradition_inactive`
- proposal before approval → overlay version, canon hash, turn, variable values, and state hash unchanged
- reject or stale decision → unchanged snapshot
- accept/edit → only the validated patch is applied; overlay vNext and a same-turn rebased snapshot share the new overlay/canon references while turn and variable values stay fixed
- after red-sail rule approval, Step 1 changes `harbor_watch` from `idle` to `watching`
- Step 2 consumes the first snapshot and changes `watching` to `signal_seen`; transition hashes form one chain
- direct `idle → signal_seen`, a third step, or either step before rule approval → blocked and unchanged snapshot
- safe transition → unchanged control cases retain their expected outcomes; the red-sail fixture matches its declared pre/post expectations
- refusal is not reported as schema failure
- missing API key is a typed configuration error
- fixture trace has no actual model or response ID

## Demo and stretch boundary

The primary UI story is a single flow: three local participant intents + selected style profile → character views → structured candidate → graph violation/proposal → creator decision → `idle → watching → signal_seen` state chain → replay. Error cases are compressed into the regression panel rather than becoming four disconnected mini-demos.

If the complete vertical slice, live trace, browser smoke, privacy scan, Evidence Packet, and release rehearsal all pass with at least 12 hours of buffer, follow `docs/MVP-SCOPE.md`'s stretch ladder. The first game-production extension is a small Quest Consistency Linter, not a general quest generator. Remote multiplayer and long-horizon simulation do not reopen automatically.

## Verification and evidence

Run `npm run verify`, inspect the full Table flow in a real browser, and record changed files, test counts, build result, intent lineage, graph/snapshot hashes, two-step replay result, remaining risks, and sanitized live-call metadata. Do not claim user value, production readiness, remote collaboration, or quest automation without their separate evidence.

Before starting this task, require an accepted and committed planning bundle and a clean worktree. After the core functionality is genuinely complete, invoke `/feedback` in this same clean task and store the returned session ID only in a gitignored private submission record and Devpost. Do not add it to source, docs, commits, screenshots, or the demo video.
