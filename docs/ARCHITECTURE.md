# Architecture

## Design rule

The language model proposes. Deterministic code decides whether the proposal is eligible to reach the creator or canon.

```text
UI / POST /api/runs
        │
        ▼
Application orchestration ── sanitized evidence log
        │
        ├─ participant-intent composition + selected StyleProfile
        ├─ deterministic retrieval ── World Pack + canon overlay + simulation snapshot
        │
        ├─ NarrativeModel port
        │      ├─ fixture adapter
        │      └─ GPT-5.6 Responses adapter
        │
        ├─ hard validators
        │      ├─ entity and state
        │      ├─ time and location
        │      ├─ character knowledge
        │      ├─ active tradition and support
        │      └─ expansion approval
        │
        ├─ derived canon/knowledge graph descriptor
        │
        └─ creator decision → deterministic transition → snapshot/hash → frozen replay
```

## Deterministic core

Pure TypeScript functions will own:

- World Pack validation
- participant-to-character ownership validation and stable intent ordering
- claim and graph-neighbor retrieval
- stable scoring and ID tie-breaking
- hard validation
- canon/knowledge graph descriptor derivation
- proposal acceptance, edit, and rejection
- canon hashing and version transitions
- simulation-state transitions and snapshot hashing
- replay comparison

The same inputs must produce byte-stable JSON. Wall-clock time, random values, network calls, and UI state stay outside this boundary.

## Model boundary

The live adapter will use:

- Responses API
- model request `gpt-5.6` (the alias currently routes to `gpt-5.6-sol`)
- `reasoning.effort: medium` as the initial measured baseline
- Structured Outputs through `text.format`
- a strict JSON schema with all object fields required and `additionalProperties: false`

The model does not need tools for this bounded generation step. Function Calling and Programmatic Tool Calling are deliberately excluded from the MVP.

The adapter must separately handle completed output, refusal, timeout, API error, and schema failure. Requested model, actual response model, response ID, and token usage are recorded in sanitized run metadata. Keys and raw private prompts are never recorded.

## World Pack

The pack contains layers, sources, entities, claims, events, rules, belief profiles, fixed states, canon profiles, original style profiles, an expansion policy, and replay case IDs.

Claims are the atomic provenance unit. Relations are derived from claims rather than stored twice. Conflicting traditions remain separate; confidence scores do not silently choose one. An unresolved active conflict returns `needs_creator_decision`.

Creator canon is an additive overlay. Replacing a source claim requires an explicit `supersedes` relation in a future schema revision; the scaffold does not yet implement this transition.

## Creator-owned style boundary

Style is a separate input layer, not hidden in a giant prompt and not treated as a property of a model brand.

```ts
type StyleConstraint = {
  id: string;
  kind:
    | "viewpoint"
    | "tense"
    | "dialogue_mode"
    | "prose_goal"
    | "avoidance"
    | "prohibited_phrase"
    | "max_words";
  value: string | number;
  checkMode: "deterministic" | "human";
};

type StyleProfile = {
  id: string;
  label: string;
  constraints: StyleConstraint[];
};
```

Every constraint ID is stable and unique within its selected profile. `ModelDraft.appliedStyleConstraintIds` must contain only IDs registered by `styleProfileId`; unknown, duplicate, or cross-profile IDs fail validation. Profiles use original descriptive constraints and must not imitate living authors. Deterministic checks own only objective properties such as output bounds and prohibited phrases; viewpoint, cadence, and voice quality remain a separately labeled human rubric. A same-model unbounded/profiled fixture may show the effect of the harness, but no cross-model superiority claim follows from it.

## Participant and speaker boundary

The facilitator collects intents locally. This is not a remote multi-user protocol.

```ts
type ParticipantIntent = {
  intentId: string;
  participantId: string;
  controlledEntityIds: string[];
  intent: string;
};

type CandidateUtterance = {
  speakerId: string;
  authorizingIntentId: string;
  contributingIntentIds: string[];
  text: string;
  assertedClaimIds: string[];
  certainty: "certain" | "uncertain";
};

type CandidateAction = {
  actorEntityId: string;
  authorizingIntentId: string;
  contributingIntentIds: string[];
  op: "set_variable";
  variableId: string;
  from: string;
  to: string;
  evidenceClaimIds: string[];
  evidenceRuleIds: string[];
};
```

`intentId` provides deterministic lineage from input to generated utterances and actions. `participantId` is a local synthetic label, not an authenticated account. `controlledEntityIds` identifies the fictional characters that participant may direct. `speakerId` and `actorEntityId` identify the fictional character producing the utterance or action. Exactly one `authorizingIntentId` must exist and control that speaker or actor. Optional `contributingIntentIds` may explain synthesis but confer no control authority; they must exist, be unique, and exclude the authorizing ID. The deterministic core rejects unknown controlled entities, duplicate participant or intent IDs, a character assigned to more than one participant, and speakers or actors outside the selected scene or authorizing control set.

## Canon/knowledge graph descriptor

The graph view is a deterministic output projection, not a graph database or a source of truth. Validators read the pack, overlay, selected structured draft, and simulation snapshot directly; they never validate against rendered graph data. Stable IDs and sorting make the same selected structured draft produce byte-identical graph JSON before SVG rendering. Live GPT-5.6 prose and candidate selection are not claimed to be deterministic.

Minimum node kinds are `entity`, `literal`, `rule`, `proposal`, `snapshot`, `state_variable`, and `state_value`. Minimum edge kinds are `claim`, `conflict`, `proposal`, `applied`, and `current_value`. A claim edge connects subject and object nodes and carries predicate, evidence IDs, visible-to IDs, and status. Visual state distinguishes active evidence, missing character knowledge, blocked assertions, ghost proposals, approved overlay relations, and current scenario values. The model-facing `agent_view` is separate from the facilitator-facing audit graph; hidden true-state edges are removed rather than passed as `hidden: true`.

## Bounded simulation state

The submission implements exactly two deterministic steps. It does not run autonomous agents or long-term memory.

```text
SimulationSnapshot(n)
→ ParticipantIntent[]
→ structured candidate actions
→ hard validation
→ creator decision
→ deterministic transition
→ SimulationSnapshot(n + 1)
```

A separate immutable `SimulationScenario` declares its World Pack, base state, `maxSteps: 2`, and finite variables with allowed transitions. The demo scenario `harbor_watch` permits `idle → watching → signal_seen`. This avoids pretending that the fixed World State contains a travel or general simulation graph.

A session `SimulationState` contains scenario ID, `turnIndex`, `canonProfileId`, `styleProfileId`, base state ID and pack version, overlay version and canon hash, present/deceased entity IDs, and sorted variable values. It does not duplicate accepted rule IDs already owned by the overlay. Canonical serialization produces its SHA-256 `stateHash`.

The only MVP action operation is a bounded `set_variable` action with one authorizing intent, optional contributing intents, `from`, `to`, evidence claim IDs, and evidence rule IDs. The red-sail proposal run starts from overlay v0 and snapshot S0. A valid accept/edit decision returns the complete validated overlay v1 plus `rebaseSnapshot(S0, overlayV1)`: a same-turn, same-variable snapshot with updated overlay/canon references and a new state hash. This rebase is not a simulation step. Step 1 consumes that rebased snapshot and moves `harbor_watch` from `idle` to `watching`; Step 2 consumes Step 1's snapshot and moves it to `signal_seen`. A third step is rejected by `maxSteps`. Blocked, rejected, unapproved, unauthorized, or stale inputs return the unchanged snapshot, including `turnIndex` and `stateHash`. Consecutive simulation transitions must satisfy `first.toStateHash === second.fromStateHash`.

## Retrieval plan

For the small demo pack, deterministic retrieval scores:

- exact entity mention
- predicate and keyword overlap
- one-hop claim relationships
- fixed state and phase match
- active canon layer

Ties sort by stable ID. A graph database and embeddings add cost without proving the MVP claim, so they are deferred until multiple large packs create a measured recall problem.

## Run states

Every run ends in exactly one state:

- `passed`
- `blocked`
- `needs_creator_decision`
- `refused`
- `error`

A blocked draft may be displayed as an untrusted candidate for diagnosis, but it is never treated as valid output or written to canon.

## Planned HTTP contract

`POST /api/runs` accepts one complete validated `CanonOverlay`, the current `SimulationSnapshot`, `styleProfileId`, `taskType`, facilitator brief, and `ParticipantIntent[]`. World Pack version, base state, location, canon profile, and focal characters are derived from the snapshot, scenario, and controlled entities rather than accepted as duplicate request authorities. The request is rejected if its overlay version/hash or style profile does not match the snapshot. The response contains character-scoped evidence, a structured draft with intent attribution, hard violations, proposals, a facilitator-facing canon/knowledge graph descriptor, a validated transition candidate, a proposed next snapshot, and a fixture/live model trace.

Creator decisions and overlay persistence remain local for the MVP. A valid accept/edit returns the next complete overlay and the rebased same-turn snapshot; reject or stale input returns both authorities unchanged. Browser storage plus JSON export avoids a server database and authentication surface.

The hosted reviewer demo runs fixture mode only. Live mode requires a server-side `OPENAI_API_KEY` plus an explicit enable flag and is disabled on the unauthenticated public deployment. A real run is executed in a controlled local/server environment and reduced to public-safe metadata under `artifacts/evidence/live-sanitized.json`; raw material remains ignored under `artifacts/live/`.

## Evidence gates

- CI: lint → typecheck → unit and replay tests → production build
- manual live gate: GPT-5.6 response metadata plus sanitized result
- simulation gate: proposal run → decision/rebase → Step 1 → Step 2 produces the same validated snapshots and hashes from identical structured inputs
- expression gate: browser trace and screenshot show multi-intent input, graph evidence, and both simulation steps
- privacy gate: no keys, private IP, personal paths, raw chats, or feedback session IDs
