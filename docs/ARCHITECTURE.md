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
        │      ├─ GPT-5.6 Responses adapter
        │      └─ gated Codex CLI adapter
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

The story-first surface uses the same authority boundary for a smaller, prose-forward loop:

```text
/story → /api/story/session → registered Scene 1
          └→ /api/story/turn → registered A/B choice resolution
                                → provisional causal ledger
                                → focal-character knowledge scope
                                → StoryModel (fixture or local Codex CLI)
                                → scope / actor / choice / echo / closure gates
                                → commit next scene or fail closed

/world → registered pack selection or creator JSON import
          → sealed pack ID + version + canonical digest
          → creator interview: goal, motive, accepted cost
          → world-compatible proposal + canonical execution
          → creator hash confirmation
          → execution
```

Dice, items, conditions, and GM rulings are optional producers of the same `ResolutionEnvelope`; they are not the story engine. The engine's invariant is that an accepted choice changes the causal ledger, returns as a later benefit or cost, and reaches a bounded small-arc payoff without expanding beyond the registered world.

## Deterministic core

Pure TypeScript functions own:

- World Pack validation
- canonical World Pack digesting, session binding, and cross-reference coverage
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

The repository has a Responses API path and two Codex CLI workflows with different proof contracts. A result from one lane cannot satisfy or be relabeled as evidence from another.

The Responses API adapter uses:

- Responses API
- requested model `gpt-5.6`; the returned model identity is recorded only after a real call
- `reasoning.effort: medium` as the initial measured baseline
- a live-only, request-authority `outputLocale`; the submission contract permits only `en`
- Structured Outputs through `text.format`
- a strict JSON schema with all object fields required and `additionalProperties: false`

The model does not need tools for this bounded generation step. Function Calling and Programmatic Tool Calling are deliberately excluded from the MVP.

The adapter must separately handle completed output, refusal, timeout, API error, and schema failure. Requested model, actual response model, response ID, and token usage are recorded in sanitized run metadata. Keys and raw private prompts are never recorded. The English evidence gate verifies request authority and Latin-script compatibility, not semantic language identity. Korean, Japanese, and Chinese require separate future hashed contracts, fixtures, and creator evidence rather than silently widening this request.

The legacy ChatGPT-authenticated Codex CLI evidence adapter requests `gpt-5.6-sol` and uses the same strict draft schema, but it has its own approval-bound evidence contract. Before approval, an ignored private review packet materializes the exact registered model input, prompt, output schema, reviewed command identity, and execution contract. Its authority binds SHA-256 values for those objects plus the registered request and World Pack. Retry authority additionally binds the exact prior receipt bytes. The creator must pass the resulting combined authority hash explicitly to the approval command; preflight recomputes and compares every binding before one dispatch is reserved.

The invocation sends the prompt over stdin and uses `--ephemeral`, `--ignore-user-config`, `--ignore-rules`, `--skip-git-repo-check`, an empty temporary working directory, `--sandbox read-only`, a strict output schema, and an allowlisted environment. Function calls, commands, file operations, MCP, web access, or any other tool activity invalidate the event stream. Raw JSONL, the final message, thread identity, review packet, approval, and terminal attempt receipt remain private and ignored. The public record contains only bounded status, hashes, usage counts, and semantic-validation results. The CLI transport cannot independently prove an actual response model or API response ID, so those fields remain `null`; only the requested model is asserted.

Every post-dispatch path must end in a durable terminal receipt before the lock and reservation are released. A schema-valid draft that later fails Red-Sail semantics, sanitization, or persistence consumes the approval instead of reopening it for another call. If receipt persistence itself fails, recovery state remains in place. Primary was consumed by a nonzero process exit. A distinct `retry-1` authority bound those exact receipt bytes and the app-bundled command identity, passed preflight, and dispatched the OpenAI-SDK-normalized schema once. The child exited zero after five parseable JSONL envelopes, but the adapter failed closed on `codex_cli_event_type_unrecognized`; no accepted usage, raw capture, sanitized result, actual model, or response ID was retained. Its immutable pre-patch diagnostics contain counts and hashes but not the exact unknown event/item type. The reader supplies empty observation defaults only to preserve that receipt, while new failure receipts explicitly retain up to sixteen safe event/item-type pairs plus overflow state. Primary approval cannot authorize retry, retry cannot open a second retry, and neither terminal receipt is live evidence.

The Story Workbench Codex CLI adapter is a separate product-generation lane. It uses the ChatGPT app-bundled executable, requests `gpt-5.6-terra`, runs ephemeral and read-only without tools, writes the strict result through `--output-last-message`, and avoids the legacy JSON-event parser. `npm run story:demo -- --transport codex_cli --branch quiet` generated Scene 2 and Scene 3 consecutively and completed the bounded session. Their output hashes are `d35bbe89f261af97f508986cfec90b3a27588a0438a075ffa3d154e52800f727` and `a2f72d35f28bbfeae7e95856a1060b8021ac81b189156da785e4a5b22ff9cca8`. The trace truthfully leaves `actualModel` and `responseId` null, so this proves Codex CLI generation under the requested-model flag, not independent serving-model identity or a Responses API call. Creator prose approval is a later gate.

The World Workbench uses that same local transport boundary for Book 19 narration after deterministic resolution. A local proof completed four accepted turns across `Plan Compromised` and `Canon Contained`. Two earlier candidates failed the narration gate—an ambiguous pronoun and an impossible place-as-actor sentence—and neither advanced the authoritative world. The final candidates were not manually rewritten and passed delegated English-language QA, but this does not establish a human creator literary verdict or independent serving-model identity.

## World Pack

The World Workbench uses `PenelopeWorldPackV1`: a strict, portable envelope around provenance, presentation, creator-input policy, identity/hidden-knowledge policy, render policy, and one bounded simulation scenario. Book 19 and Oz are registered implementations. A creator definition omits the digest; the server validates and seals it, then stores the exact pack with its session checkpoint. Runtime routes resolve that sealed pack directly and never infer it from a scenario name.

Imported packs are an MVP interoperability boundary, not a world-building UI. They are kept in process-local server memory for at most 30 minutes, omitted from the public registry, and bound to child checkpoints by pack ID, semantic version, and digest. The participant projection receives only presentation data; creator-input and render-policy bodies remain server-side. The creator-capability endpoint may separately return human-readable hidden premises and risks. This is not account authentication, persistent storage, or a confidentiality guarantee.

The older Table/Red-Sail surface retains its original forensic World Pack contract. It remains supporting evidence and is not used to infer `/world` behavior.

The pack contains layers, sources, entities, claims, events, rules, belief profiles, fixed states, canon profiles, original style profiles, an expansion policy, and replay case IDs.

Claims are the atomic provenance unit. Relations are derived from claims rather than stored twice. Conflicting traditions remain separate; confidence scores do not silently choose one. An unresolved active conflict returns `needs_creator_decision`.

Creator canon is an additive overlay. Replacing a source claim requires an explicit `supersedes` relation in a future schema revision; the MVP does not implement this transition.

## Myth Atlas handoff boundary

External research material does not become a World Pack merely because its files are well formed. The repository-side Myth Atlas intake first checks a bounded manifest, portable relative paths, regular-file identity, per-file and aggregate size limits, SHA-256 digests, supported schema versions, and a user-controlled root that remains immutable during inspection. It emits a sanitized receipt containing IDs, counts, statuses, sizes, and hashes—not source prose or local paths.

Producer-reported or `video_reported` material can only become `quarantined_private_reference`. Pending source, rights, or cultural review remains visible as warnings. It cannot update the demo World Pack, overlay, graph, or canon. A public-canon request additionally requires a parseable Penelope World Pack with matching pack ID and version plus source, verification, and rights/culture artifact roles. Even then, the current implementation fails closed because those supporting artifacts do not yet have independent content validators and no Penelope-owned creator-review store exists. Public acceptance will not open by flipping fields in a producer manifest.

The current Myth Atlas package reports ten exact-passage claim candidates, five lower-evidence `video_reported` items, and six pending items. Its first machine-readable manifest passed the producer's verifier but failed this consumer schema because provenance, rights/culture, and asset roles used free-form values instead of the allowlisted contract. Corrected packaging revision `v1.0.1` retains manifest `schemaVersion: "1.0.0"`; the consumer verified schema and byte integrity for 16 external assets totaling 2,489,820 bytes and returned `quarantined_private_reference` with no blockers. The resulting warnings are `creator_review_not_performed`, `rights_not_cleared`, `culture_not_cleared`, `producer_reported_provenance_only`, `video_reported_claims_present`, and `pending_items_present`. This trust boundary is producer attestation plus byte integrity only: no asset was copied, imported, or content-validated as a Penelope World Pack. Public evidence and canon remain blocked by rights/culture review, supporting-artifact validation, unresolved video and pending items, and Penelope creator review.

The local consumer command prints a path-free sanitized receipt and does not copy or promote source material:

```bash
npm run myth-atlas:intake -- \
  --root /absolute/path/to/myth-atlas-root \
  --manifest /absolute/path/to/myth-atlas-root/handoff/manifest.json \
  --use private_creative_reference
```

Exit `0` means private quarantine only, `2` means a schema-valid handoff was blocked by governance, and `1` means the handoff or byte-integrity contract failed. None of these outcomes changes canon.

The first allowed consumer use is analysis, not generation. `npm run myth-atlas:compatibility -- --root <root> --manifest <manifest>` reruns private intake, binds the canonical receipt hash to the registered demo World Pack hash, and emits a path- and prose-free `analysis_only_no_import` report. The accepted Cyclops package produced receipt hash `5b5f390aed77c9c82eb3df4a419bbce3d7078c5c1994921f1197ee71bbb1977b` against World Pack hash `8e73033c7f67e6fc501b893dd905157fde6dfb746c757f74ed017c1639167f57`. Runtime, model-input, canon, and public eligibility are all false with zero eligible claims. The report names the schema, pack-identity, claim-semantics, source, entity, phase, and knowledge mappings plus provenance, rights, culture, unresolved-item, and creator-review gates still required. It neither parses claim prose nor mutates the World Pack.

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

The supporting Red-Sail simulation implements exactly two deterministic steps. World Workbench packs may declare one through six turns. Neither path runs autonomous agents while the creator is idle or provides long-term memory.

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

`POST /api/story/session` returns the registered Scene 1, two real continuation choices, the selected style profile, and an explicit fixture/live transport label. `POST /api/story/turn` accepts only the current validated story session plus a registered A/B choice. A missing or unregistered `choiceId` returns 422; the API never turns it into the first fixture branch. The application builds a provisional causal event, sends only narrator-safe and present-speaker-shareable knowledge to the model, validates structured prose segments, exact allowed next choices, and bounded semantic guards for every registered Red-Sail reserved action, and commits the ledger/session only after every gate passes. C is handled by the World Workbench interview: it gathers goal, motive, and accepted cost; returns `stateChanged: false` for incomplete, ambiguous, or unsupported input; exposes world-compatible canonical execution; then requires creator hash confirmation before execution. HTTP Codex CLI execution requires `PENELOPE_STORY_CODEX_CLI_ENABLED=1`, a bounded high-entropy token compared through SHA-256 digests with `timingSafeEqual`, and a loopback host as defense-in-depth. The token is accepted only in a private header and never enters story JSON. The current full production browser suite passes 40 Chromium desktop/mobile WebKit checks, including the real Story fixture API path, World causal flow, cross-world selection, and creator-pack import.

`POST /api/world/session` selects a registered pack or accepts one strict creator-pack definition, seals it, and returns its bounded opening and participant-safe world view. `POST /api/world/turn` accepts registered A/B actions or the fully elicited and hash-confirmed C execution; it resolves state and declared NPC reactions before narration. `POST /api/world/narration-draft` applies creator approval, edit, or rejection to the current candidate. Rejection cannot mutate the typed world, causal receipt, or checkpoint. The browser retains session checkpoint references for Fork Compare, which compares state and receipts rather than prose similarity. The portability browser gate switches from Book 19 to Oz, imports a creator-owned JSON definition, continues one turn, and checks for Odyssey leakage in desktop Chromium and mobile WebKit.

`POST /api/runs` accepts one complete validated `CanonOverlay`, the current `SimulationSnapshot`, `styleProfileId`, `taskType`, facilitator brief, and `ParticipantIntent[]`. World Pack version, base state, location, canon profile, and focal characters are derived from the snapshot, scenario, and controlled entities rather than accepted as duplicate request authorities. The public fixture route additionally requires canonical equality with the exact registered red-sail replay stage; a changed brief, intent, draft ID, style, task, overlay, or snapshot is rejected before fixture execution. This prevents a caller from attaching arbitrary prompt prose to a fixed draft and relabeling it as causal output. The response contains character-scoped evidence, a structured draft with intent attribution, hard violations, proposals, a facilitator-facing canon/knowledge graph descriptor, a validated transition candidate, a proposed next snapshot, and a fixture/live model trace.

`POST /api/decisions` first reasserts exact equality with the registered public run, then replays that fixture before it applies accept/edit/reject against the bound proposal and overlay. Editing may change a separate non-authoritative `displayDescription`; it cannot change the semantic `description`, patch target, rule kind, claim summary, claim subject/predicate/object, temporal or spatial scope, visibility, conflict set, or sources. The proposal and graph audit surfaces always render the locked semantic description as authority and expose display wording separately as non-authoritative; presentation copy cannot conceal the rule that transitions actually use. A valid accept/edit returns the next complete overlay, a same-turn rebased snapshot, and a fresh four-control regression bound to that exact overlay hash; a regression failure returns 409 rather than an applied canon response. `POST /api/transitions` repeats the registered-request assertion and does not trust a client-supplied overlay: it requires the original fixture `runRequest`, creator decision, requested step, and prior snapshot; replays the run and decision on the server; reruns the approved-overlay controls; derives S0r or S1; and compares the complete requested snapshot before it applies one registered action. Both endpoints remain stateless. The browser carries server-returned authorities plus the original decision inputs, avoiding a database while preventing a relabeled fixture or self-hashed, unapproved overlay from authorizing state change.

The stateless route proves state-chain authority, not the historical occurrence of an earlier HTTP call. A caller with the exact authorized S1 may deterministically replay Step 2 without server session storage; the product UI still exposes Step 2 only after its Step-1 response. Persistent room chronology and signed per-session receipts are outside this MVP and must not be claimed.

The reviewer demo and public run route are fixture-only; the route rejects live requests before orchestration. The separate local evidence command requires `OPENAI_API_KEY` plus `ENABLE_OPENAI_LIVE=true`, an exact request-hash-bound creator approval, and a fresh successful preflight. It prevalidates configuration and completed outputs, reserves one exclusive dispatch lock plus a prose-free recovery sentinel, records each normally completed dispatch as an append-only ignored receipt, and publishes raw then sanitized files through same-directory temporary files plus atomic no-clobber hard links. Receipt-write failure preserves the sentinel and lock for manual recovery; it cannot silently become verified evidence. There is no retry loop. A fixed `retry-1` attempt opens only after a retryable primary typed-failure receipt for the same request, absence of canonical output and recovery state, and a separate ignored creator approval; any third or relabeled attempt is rejected. Evidence generation requires an authority-bound completed receipt and derives a write-once public receipt before reporting live readiness.

The legacy Codex CLI evidence command is an additional local-only route, not a fallback identity for the Responses API route or the Story Workbench product lane. Each fixed attempt followed `review` → creator inspection → `approve -- --authority-sha <sha>` → `preflight` → `capture`. The review/approval binding covers the prompt, model input, output schema, reviewed command identity, execution contract, request, World Pack, and retry predecessor receipt where applicable. Primary plus the separately authorized fixed retry are both consumed. No tool use or third attempt is allowed, and the terminal-receipt rule prevents approval reuse after any completed dispatch. Raw/private and sanitized/public artifacts form an optional all-or-none evidence-manifest group and never fill Responses-specific identity fields.

After public-safe legacy evidence verifies, a private review command revalidates the exact registered Red-Sail result and writes generated prose plus a pending decision only under ignored `artifacts/live/`. The creator may accept, reject, or edit a non-authoritative `displayDescription`; canonical rule semantics cannot be edited. Finalization recomputes the exact proposal authority, applies accept/edit only through the deterministic overlay and four-control replay, proves `idle → watching → signal_seen` as a two-transition hash chain, and emits a prose-free public harness receipt. Reject proves unchanged overlay/state and zero transitions. The legacy CLI dispatches produced no accepted result. The separate Story and World Workbench runs did produce validated prose candidates, but their independent serving-model identity remains open; the Book 19 run's delegated English QA is not human creator literary acceptance.

Production builds inject one immutable `BUILD_COMMIT_SHA`; Vercel or GitHub commit metadata outranks a manual `BUILD_SHA`. The local/CI `build:identified` preflight requires the exact 40-character repository HEAD and rejects any tracked or untracked worktree change before `next build`, preventing a dirty tree from borrowing a clean commit label. `/api/health` returns the embedded identity with `Cache-Control: no-store` and reports only whether a strict verified tracked live-readiness record was built into the deployment. It does not claim to revalidate ignored raw evidence at runtime. The local release/submission gate separately binds raw source, sanitized evidence, completed receipt, manifest bytes, current authority, and registered scenario semantics. Deployment smoke requires this readiness signal to be present and boolean, but an honest `false` does not masquerade as a deployment failure or as completed live proof; the separate submission gate remains blocked until the live bundle verifies. Deployment smoke also requires the expected SHA, cache-busts the root and health requests, rejects redirects, and compares the exact build identity before it exercises fixture behavior. It then recomputes overlay and snapshot hashes and verifies every S0r→S1→S2 transition record, state hash, canon hash, intermediate value, and returned snapshot. Post-build trace inspection rejects any Next.js dependency manifest that references `private-submission/`, `artifacts/live/`, local environment files, or personal home paths.

## Evidence gates

- CI: lint → typecheck → unit and replay tests → production build
- manual live gate: GPT-5.6 response metadata plus sanitized result
- simulation gate: proposal run → decision/rebase → Step 1 → Step 2 produces the same validated snapshots and hashes from identical structured inputs
- expression gate: browser trace and screenshot show the registered frozen two-intent lineage, visible style and knowledge receipts, graph evidence, and both simulation steps; arbitrary free-text composition requires separate live evidence
- privacy gate: no keys, private IP, personal paths, raw chats, or feedback session IDs
