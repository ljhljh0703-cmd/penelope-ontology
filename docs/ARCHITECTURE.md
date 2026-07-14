# Architecture

## Design rule

The language model proposes. Deterministic code decides whether the proposal is eligible to reach the creator or canon.

```text
UI / POST /api/runs
        │
        ▼
Application orchestration ── sanitized evidence log
        │
        ├─ registered fixture intent bundle / gated live intent bundle + selected StyleProfile
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

Pure TypeScript functions own:

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

The live adapter uses:

- Responses API
- requested model `gpt-5.6`; the returned model identity is recorded only after a real call
- `reasoning.effort: medium` as the initial measured baseline
- Structured Outputs through `text.format`
- a strict JSON schema with all object fields required and `additionalProperties: false`

The model does not need tools for this bounded generation step. Function Calling and Programmatic Tool Calling are deliberately excluded from the MVP.

The adapter must separately handle completed output, refusal, timeout, API error, and schema failure. Requested model, actual response model, response ID, and token usage are recorded in sanitized run metadata. Keys and raw private prompts are never recorded.

## World Pack

The pack contains layers, sources, entities, claims, events, rules, belief profiles, fixed states, canon profiles, original style profiles, an expansion policy, and replay case IDs.

Claims are the atomic provenance unit. Relations are derived from claims rather than stored twice. Conflicting traditions remain separate; confidence scores do not silently choose one. An unresolved active conflict returns `needs_creator_decision`.

Creator canon is an additive overlay. Replacing a source claim requires an explicit `supersedes` relation in a future schema revision; the MVP does not implement this transition.

## Creator-owned style boundary

Style is a separate input layer, not hidden in a giant prompt and not treated as a property of a model brand.

```ts
type StyleConstraint = {
  id: string;
  kind:
    | "viewpoint"
    | "tense"
    | "dialogue_mode"
    | "cadence"
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

Every constraint ID is stable and unique within its selected profile. `ModelDraft.appliedStyleConstraintIds` must contain only IDs registered by `styleProfileId`; unknown, duplicate, or cross-profile IDs fail validation. Profiles use original descriptive constraints and must not imitate living authors. Deterministic checks own only objective properties such as output bounds and prohibited phrases; viewpoint, cadence, and voice quality remain a separately labeled human rubric. A preregistered same-model `default_instruction_control`/`profiled` AB/BA probe tests the harness mechanism on one fixed case; it does not itself establish improvement, literary quality, or cross-model superiority.

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

## HTTP contract

`POST /api/runs` accepts one complete validated `CanonOverlay`, the current `SimulationSnapshot`, `styleProfileId`, `taskType`, facilitator brief, and `ParticipantIntent[]`. World Pack version, base state, location, canon profile, and focal characters are derived from the snapshot, scenario, and controlled entities rather than accepted as duplicate request authorities. The public fixture route additionally requires canonical equality with the exact registered red-sail replay stage; a changed brief, intent, draft ID, style, task, overlay, or snapshot is rejected before fixture execution. This prevents a caller from attaching arbitrary prompt prose to a fixed draft and relabeling it as causal output. The response contains character-scoped evidence, a structured draft with intent attribution, hard violations, proposals, a facilitator-facing canon/knowledge graph descriptor, a validated transition candidate, a proposed next snapshot, and a fixture/live model trace.

`POST /api/decisions` first reasserts exact equality with the registered public run, then replays that fixture before it applies accept/edit/reject against the bound proposal and overlay. Editing may change a separate non-authoritative `displayDescription`; it cannot change the semantic `description`, patch target, rule kind, claim summary, claim subject/predicate/object, temporal or spatial scope, visibility, conflict set, or sources. The proposal and graph audit surfaces always render the locked semantic description as authority and expose display wording separately as non-authoritative; presentation copy cannot conceal the rule that transitions actually use. A valid accept/edit returns the next complete overlay, a same-turn rebased snapshot, and a fresh four-control regression bound to that exact overlay hash; a regression failure returns 409 rather than an applied canon response. `POST /api/transitions` repeats the registered-request assertion and does not trust a client-supplied overlay: it requires the original fixture `runRequest`, creator decision, requested step, and prior snapshot; replays the run and decision on the server; reruns the approved-overlay controls; derives S0r or S1; and compares the complete requested snapshot before it applies one registered action. Both endpoints remain stateless. The browser carries server-returned authorities plus the original decision inputs, avoiding a database while preventing a relabeled fixture or self-hashed, unapproved overlay from authorizing state change.

The stateless route proves state-chain authority, not the historical occurrence of an earlier HTTP call. A caller with the exact authorized S1 may deterministically replay Step 2 without server session storage; the product UI still exposes Step 2 only after its Step-1 response. Persistent room chronology and signed per-session receipts are outside this MVP and must not be claimed.

The reviewer demo and public run route are fixture-only; the route rejects live requests before orchestration. The separate local evidence command requires `OPENAI_API_KEY` plus `ENABLE_OPENAI_LIVE=true`. It prevalidates configuration and completed outputs, reserves one exclusive dispatch lock plus a prose-free recovery sentinel, records each normally completed dispatch as an append-only ignored receipt, and publishes raw then sanitized files through same-directory temporary files plus atomic no-clobber hard links. Receipt-write failure preserves the sentinel and lock for manual recovery; it cannot silently become verified evidence. An ordinary incomplete pair rolls back; a typed model failure with a durable receipt releases the lock and permits a new explicit attempt. Evidence generation requires an authority-bound completed receipt and derives a write-once public receipt before reporting live readiness. No live call has yet been captured. When one is captured, only public-safe hashed metadata may be written under `artifacts/evidence/`; raw material remains ignored under `artifacts/live/`.

Production builds inject one immutable `BUILD_COMMIT_SHA`; Vercel or GitHub commit metadata outranks a manual `BUILD_SHA`. The local/CI `build:identified` preflight requires the exact 40-character repository HEAD and rejects any tracked or untracked worktree change before `next build`, preventing a dirty tree from borrowing a clean commit label. `/api/health` returns the embedded identity with `Cache-Control: no-store` and reports live evidence only when the generated readiness artifact matches the full evidence-type, GPT-5.6 model, authority-hash, sanitized-path, and public-privacy contract. Deployment smoke requires the expected SHA, cache-busts the root and health requests, rejects redirects, and compares the exact build identity before it exercises fixture behavior. It then recomputes overlay and snapshot hashes and verifies every S0r→S1→S2 transition record, state hash, canon hash, intermediate value, and returned snapshot.

## Evidence gates

- CI: lint → typecheck → unit and replay tests → production build
- manual live gate: GPT-5.6 response metadata plus sanitized result
- simulation gate: proposal run → decision/rebase → Step 1 → Step 2 produces the same validated snapshots and hashes from identical structured inputs
- expression gate: browser trace and screenshot show the registered frozen two-intent lineage, visible style and knowledge receipts, graph evidence, and both simulation steps; arbitrary free-text composition requires separate live evidence
- privacy gate: no keys, private IP, personal paths, raw chats, or feedback session IDs
