# Post-Core Causal Runtime

Status: pure-domain post-core slice implemented; product wiring pending
Product: Penelope Ontology
Evidence status: deterministic local contract tests plus one local runtime benchmark; not wired and not a current public product claim

## 1. Purpose and release boundary

This document specifies and records the first pure-domain slice for making player, NPC, and world actions persist as causal consequences without sending an ever-growing transcript or whole World Pack to the model.

It does not reopen or modify the frozen Build Week fixture, replay authority, public evidence, or submission claims. The current two-step `set_variable` simulation remains the only implemented public evidence until this slice has runtime wiring, representative live evidence, and creator acceptance.

Implemented in the current tree:

- strict `CampaignEvent`, bounded effect, cursor, ledger, projection, and working-set contracts;
- append-only entry and cursor hash chains with stale-head, inactive-evidence, unknown-entity, unknown-cause, and unknown-debt rejection;
- exact one-shot authority receipts that bind each player intent, NPC/world trigger, and irreversible ruling to the normalized event and current branch head;
- deterministic simulation-receipt binding for state transitions, including exact World Pack identity/version checks;
- active ontology registries for action types, relation axes, resources, flags, clocks, and debt kinds, so a resolved event cannot invent a new gameplay dimension while appending;
- deterministic reducers for relations, resources, knowledge, flags, clocks, and open causal debts;
- participant-control-derived visibility, bounded causal ancestry/effects, a hard byte ceiling, and compact deterministic model context;
- mandatory pinning of the just-applied visible event and all of its typed effects even when optional retrieval budgets are set to zero;
- `prepareCampaignTurn`, which applies one resolved event and returns the causal suffix for the next narrative call without modifying root canon or making an extra summarization call;
- unit coverage for deterministic append, blocked byte identity, tamper rejection, reducer behavior, cause closure, budget truncation, hidden-information isolation, and action-to-next-context propagation.

The following remain pending:

- UI for branch history, causal debt, NPC agendas, and creator promotion;
- API persistence and concurrency behavior;
- model adapter and prompt-cache telemetry wiring, plus streaming;
- storage selection and migrations;
- representative campaign replay, live-model token/cache, and deployment-target latency measurements;
- any public claim that Penelope supports persistent campaigns or autonomous NPC simulation.

## 2. Creator-approved semantics

1. An applied event becomes an immediate fact of its campaign branch.
2. A campaign event does not alter root world canon.
3. Root world canon changes only through a separate, creator-approved promotion with version and hash checks.
4. The append-only typed causal ledger is the branch authority.
5. LLM Wiki prose, summaries, and dashboards are derivative views. They never authorize a transition.
6. AI-proposed world facts remain provisional until explicit creator approval.
7. Deterministic reducers apply validated effects before the one long-form prose call for a resolved scene.
8. Hidden information stays in facilitator-authorized projections and never enters a player- or character-scoped prompt.
9. Offscreen NPC actions are activated by world time and exact one-shot trigger receipts, not by continuously calling a model for every NPC.
10. Significant offscreen actions must leave at least one fair interaction surface: prior pressure, an interruption window, or a discoverable trace.

The separation of authorities is:

```text
Root World Pack + approved creator overlay
                 |
                 v
         Campaign branch baseline
                 |
       applied CampaignEvent[]
                 |
                 v
   current branch head + materialized views

Campaign branch facts --creator promotion review--> root creator overlay vNext
```

Promotion is an explicit authoring operation. Completing a campaign, accepting an in-play consequence, or rendering a Wiki page does not imply promotion.

## 3. Authority model

### 3.1 Typed append-only ledger

`CampaignEvent` is the smallest authoritative record of something that actually changed the branch. It should contain identifiers and compact typed operations rather than a prose retelling.

```ts
type CampaignEvent = {
  eventId: string;
  branchId: string;
  sequence: number;
  turn: number;
  worldTime: string;
  actorId: string;
  actionType: string;
  targetIds: string[];
  causeEventIds: string[];
  preconditionRefs: string[];
  effects: EffectOp[];
  visibility: VisibilityScope;
  traceIds: string[];
  reversibility: "reversible" | "irreversible";
  irreversibleRuling: RuleReceipt | GmApprovalReceipt | null;
  beforeStateHash: string;
  afterStateHash: string;
  transitionReceiptHash: string | null;
};
```

Only an accepted and applied transaction is appended as a branch fact. Rejected, stale, blocked, and provisional candidates remain separate receipts and cannot affect materialized views.

Each append requires:

- monotonically increasing branch sequence;
- idempotency key or equivalent duplicate protection;
- exact parent branch head;
- an exact, unused intent or trigger receipt bound to the normalized event and current branch head;
- precondition and authority validation;
- active ontology membership for every action and non-state effect dimension;
- deterministic effect ordering;
- before/after state hashes;
- an exact applied simulation receipt for every state transition;
- an exact, unused registered-rule or approved-GM receipt for every irreversible result;
- atomic ledger append plus projection update, or a recoverable outbox equivalent.

### 3.2 Bounded effect operations

The implemented first post-core contract supports this deliberately small discriminated union:

- `state_transition`: record one registered finite-state change and its before/after state hashes;
- `relation_delta`: apply a bounded relationship delta;
- `resource_delta`: add or consume an approved item, leverage, or capability;
- `knowledge_grant`: add an active claim to an entity's knowledge projection;
- `flag_set`: set a registered boolean consequence;
- `clock_delta`: advance or reverse a registered pressure or deadline clock;
- `debt_open` and `debt_resolve`: create or discharge a tagged consequence.

NPC agenda scheduling and cancellation are deliberately not implemented in this slice. They require their own packet contract, clock-trigger reducer, and cascade budget before model or UI wiring.

No effect operation executes arbitrary code or free-form model output. New operation kinds require a schema revision, reducer, invariant tests, and replay evidence.

### 3.3 Causal debt, not one karma score

A single good-versus-evil number loses the person, victim, knowledge, and unresolved obligation that make consequences narratively specific. The current reducer therefore stores an open debt as debtor, creditor, debt kind, weight, and opening event. The richer target contract below can later add partial settlement, explicit observers, and trigger references without replacing the event authority.

```ts
type CausalDebt = {
  debtId: string;
  causeEventId: string;
  debtorId: string;
  affectedEntityIds: string[];
  kind: "favor" | "betrayal" | "harm" | "promise" | "exposure" | "obligation";
  magnitude: 1 | 2 | 3;
  knownByIds: string[];
  status: "open" | "partially_settled" | "settled" | "forgiven";
  triggerRefs: string[];
};
```

The magnitude is selected by an approved rule or GM ruling, not invented silently by the prose model. Future NPC reactions retrieve the debt's cause and affected entities instead of responding to an unexplained global score.

## 4. Materialized views and LLM Wiki

The ledger is optimized for authority and replay. The current implementation deterministically rebuilds its small typed projection from the ledger and derives an audience-visible working set. Persistence should incrementally update the same reducer output once API storage is selected; replay remains the recovery and verification path.

The current projection contains relations, resources, character knowledge, flags, clocks, and open debts. The table below is the intended product-facing view layer built from those primitives plus later agenda and location contracts.

The current pure-domain implementation uses deterministic maps and bounded identifier lookups; it makes no embedding query, graph-database round trip, or LLM summarization call in the turn hot path. Its in-memory integrity replay is still linear in ledger length. Persistence can later incrementally maintain the same reducer outputs and add indexed adjacency only when campaign measurements justify that complexity.

Initial views:

| View | Purpose | Hot-prompt use |
|---|---|---|
| `SceneStateView` | Current place, time, pressure, present entities, usable traces | Always for the active scene |
| `NpcAgendaView` | Desire, current plan, deadline, blockers, resources, fallback | Only for eligible or directly affected core NPCs |
| `CharacterKnowledgeView` | Known, uncertain, false, and hidden claims by character | Character-scoped only |
| `OpenThreadsView` | Unresolved hooks, clocks, intervention windows, ending pressure | Top relevant threads only |
| `CausalDebtView` | Open favors, harms, betrayals, promises, and who knows them | Only debts connected to current actors, targets, or triggers |
| `LocationImpactView` | Persistent changes and available traces at a location | Current location and one directly connected destination |

Every view records `branchId`, `lastEventSequence`, `projectionVersion`, and `stateHash`. A stale or mismatched view is invalid and must be rebuilt from the ledger before use.

LLM Wiki prose is generated lazily from these views for creator readability. It must:

- cite its source event and claim IDs;
- declare its branch head and projection version;
- avoid summary-of-summary updates;
- be replaceable by deterministic replay from the ledger;
- never serve as a reducer input unless its cited typed sources are retrieved independently.

This makes the Wiki a useful narrative memory surface without turning prose drift into world state.

## 5. Turn transaction

### 5.1 GM-resolved default

The latency-efficient default for professional GMs and narrative teams is:

```text
1. Receive participant intent plus GM/rules resolution.
2. Normalize it into an ActionFrame.
3. Retrieve hard preconditions and directly affected views.
4. Validate and apply typed EffectOp[] deterministically.
5. Append one CampaignEvent transaction and update affected projections.
6. Evaluate clocks and eligible NPC packets as one world tick.
7. Build a bounded visible causal working set.
8. Make one prose-generation call for the resolved scene.
```

The prose model sees the applied outcome. It does not speculate about which state transition will later be accepted. If prose generation fails, the applied transaction remains reproducible and can be rendered again; failure cannot create a second state transition.

### 5.2 AI-assisted adjudication exception

Free-form input may sometimes require a check recommendation or semantic interpretation before deterministic resolution. In that path, one short Structured Output call may propose an `ActionFrame`; the GM or deterministic rule engine resolves it; then one long-form prose call renders the result. The adjudication result is a proposal, not an authoritative effect.

This exception is capped at two calls for the turn. Penelope must not generate four long outcome branches before a die roll merely to preserve an artificial one-call claim.

### 5.3 Irreversible effects

Death, permanent abduction, unique-item destruction, and ending locks require a registered rule or explicit GM approval at the last fair intervention window. The event records the ruling and evidence. The campaign branch accepts the result immediately after approval; root canon still remains unchanged.

## 6. Bounded causal retrieval

Retrieval starts from authoritative identifiers, not a global semantic search over every note.

Seed set:

- acting and targeted entities;
- current scene and location;
- causal parents of the proposed action;
- active hard rules and preconditions;
- open clocks and intervention windows;
- eligible NPC agendas;
- causal debts involving the actors, targets, or observers;
- character-visible traces and knowledge only.

Expansion order:

1. mandatory dependency closure for rules, causes, and state preconditions;
2. direct ontology neighbors;
3. one bounded second hop only when budget remains and a registered relation justifies it;
4. lexical or embedding reranking for optional context;
5. deterministic tie-breaking by criticality, causal distance, recency, then stable ID.

Hard dependencies cannot be dropped by a top-k ranker. Optional color and distant history are the first items removed when the token budget is exceeded.

The just-applied visible event is not optional retrieval. Its event record and all typed effects are reserved before optional event/effect budgets, so a caller cannot erase the immediate consequence with `maxEvents: 0` or `maxEventEffects: 0`. If mandatory pinned data exceeds the absolute hard ceiling, the turn fails closed instead of producing consequence-free prose.

`focalEntityIds` answer “what is this scene about?”; they are not an authorization list. Character visibility is derived separately from server-verified participant control, and one character-scoped working set is built per participant. A client cannot gain a private event by adding an NPC or another participant's character to the focal list. Facilitator context is an explicit privileged principal.

The full transcript, complete ledger, full World Pack, and every NPC profile must never be placed in the hot prompt. Campaign length should increase cold storage, not standard-turn prompt size.

The current compact suffix uses a versioned tuple contract so field names and 64-character integrity hashes are not repeated on every turn. Its stable-prefix legend is:

```text
v version, b branch, f focal entities, p authorized viewer entities, a audience
e events = [id,tick,source,actor,action,targets,causes,claimRefs,ruleRefs,traceRefs,effectKinds,effectOps,reversibility]
effectOps tags: s state, r relation, q resource, k knowledge, g flag, c clock, do debt-open, dr debt-resolve
u variables = [variable,value]
r relations = [subject,object,axis,value]
q resources = [entity,resource,value]
k knowledge = [entity,claim]
g flags = [entity,flag,value]
c clocks = [clock,value]
d open debts = [debt,debtor,creditor,kind,weight]
t truncated
```

Full cursor, state, projection, and working-set hashes remain in the application receipt for audit and stale-state checks. They are intentionally absent from the prose prompt: the model cannot use opaque digests, and character-scoped payloads should not reveal that a hidden branch update occurred merely because a hash changed.

## 7. Offscreen NPC batching

NPC autonomy is designed as approved agenda packets, not continuous per-NPC model conversations. The packet executor remains a later slice.

```ts
type NpcAgendaPacket = {
  npcId: string;
  goalRef: string;
  knowledgeRefs: string[];
  requiredResourceRefs: string[];
  triggerRefs: string[];
  timeWindow: string;
  primaryEffects: EffectOp[];
  fallbackEffects: EffectOp[];
  interruptionWindowRef: string;
  traceTemplates: string[];
};
```

When world time advances:

1. collect packets whose time and trigger conditions are satisfied;
2. discard packets missing knowledge, means, opportunity, or required resources;
3. order remaining packets by world time, dependency, deadline, then stable ID;
4. resolve compatible packets in one deterministic transaction batch;
5. use registered fallback effects when a primary action is blocked;
6. append hidden outcomes without prose generation;
7. expose only visible consequences and discoverable traces in the next working set.

The runtime makes zero model calls for ordinary offscreen execution. If a registered packet explicitly requires creative interpretation, all eligible creative cases for that tick are combined into at most one bounded call; there is never one call per NPC.

## 8. Prompt layout and cache strategy

OpenAI's prompt-caching guidance says cache hits require exact prefix matches, with static content first and variable content last. It also recommends using one `prompt_cache_key` for requests that genuinely share a long common prefix and measuring cache reads and writes. See the official [Prompt caching guide](https://developers.openai.com/api/docs/guides/prompt-caching).

Penelope's request layout should therefore be:

```text
STABLE PREFIX
1. Global narrative/runtime instructions
2. Structured Output schema and semantic field contract
3. World Pack identity, version, stable core rules, and stable ontology vocabulary
4. Creator-approved root overlay version and facts
5. Selected creator-owned style profile
6. Explicit cache breakpoint after the reusable prefix, when supported

DYNAMIC SUFFIX
7. Campaign branch identity (keep branch-head and integrity hashes in the receipt, not the prose prompt)
8. Current SceneStateView
9. Bounded character-visible causal working set
10. Applied effect receipt and visible offscreen consequences
11. Current participant intent and requested output length
```

The recommended cache-key identity is derived only from stable prefix authorities:

```text
penelope:sha256(<worldPackId>,<worldPackVersion>,<approvedOverlayHash>,<styleProfileId>,<responseSchemaVersion>)
```

The concrete implementation may hash that tuple before sending it. It must **not** include the campaign branch ID, branch head, turn number, state hash, current player input, or retrieved working set. Those values belong in the dynamic suffix. Including the branch head in `prompt_cache_key` would create a new routing key on every turn and defeat cross-turn prefix reuse even though the root world, approved overlay, style, and schema are unchanged.

Correctness must not depend on a cache hit. Cache behavior is best-effort, and the runtime must produce the same validated domain result on a miss. Instrument `cached_tokens` and `cache_write_tokens` where the selected model exposes them, then compare read savings against writes rather than claiming savings from prompt shape alone.

The official [Latency optimization guide](https://developers.openai.com/api/docs/guides/latency-optimization) prioritizes generating fewer tokens, using fewer input tokens, making fewer requests, parallelizing independent work, and not defaulting to an LLM. Those principles motivate deterministic reducers, bounded materialized views, zero-call offscreen execution, and one long-form scene call.

Penelope should continue using the Responses API and strict Structured Outputs for model-facing contracts. The official [Responses migration guide](https://developers.openai.com/api/docs/guides/migrate-to-responses) documents typed input/output Items, `text.format` Structured Outputs, and multiple state-management options. The branch ledger remains Penelope's authority: `previous_response_id` or a conversation object may assist model continuity later, but neither replaces the causal ledger, and prior context in a response chain is still billed as input.

## 9. Initial performance and correctness budgets

These are post-core acceptance targets, not measured current results.

| Metric | Initial budget | Gate meaning |
|---|---:|---|
| Long-form prose calls per GM-resolved turn | `<= 1` | No planner/critic/rewrite cascade |
| Total calls per AI-adjudicated turn | `<= 2` | One short adjudication plus one prose call |
| Calls for ordinary offscreen world tick | `0` | Deterministic agenda execution |
| Creative offscreen calls per tick | `<= 1` | Batch, never per NPC |
| Dynamic causal working set | `<= 3,500` input tokens P95 | Stable prefix excluded |
| Total model input | `<= 6,000` tokens P95 | Includes stable prefix and dynamic suffix |
| Default scene output | `<= 1,200` tokens | Task-specific cap replaces one global maximum |
| Climax scene output | `<= 2,000` tokens | Explicit creator/GM request only |
| Retrieved claims/effects | `<= 24` optional items | Just-applied effects and mandatory dependency closure are reserved first |
| Directly related prior events | `<= 6` by default | Older events represented by typed projections |
| Eligible NPC agendas in prose working set | `<= 4` | Hidden deterministic packets need no prose context |
| Active hard rules in hot context | `<= 6` plus mandatory dependencies | No full-rule-pack injection |
| Reducer + projection + retrieval overhead | `< 150 ms` P95 at 10,000 events / 500 entities | Excludes model latency |
| Total non-model application overhead | `< 300 ms` P95 | Measured around one model call |
| Cache-read ratio after warm-up | `>= 50%` of eligible stable-prefix tokens | Observability target, not correctness gate |
| Standard-turn prompt growth, turn 10 to 100 | `<= 2%` at equal scene complexity | Campaign history stays cold |
| Mandatory causal dependency recall | `100%` | Hard gate |
| Hidden-information leaks | `0` | Hard gate |
| Duplicate event applications | `0` | Hard gate |
| Stale projection accepted | `0` | Hard gate |
| Deterministic replay hash mismatches | `0` | Hard gate |

End-to-end model latency should be reported as measured P50/P95 rather than promised as a fixed number before a representative live run. The implementation target is `model-call latency + less than 300 ms P95` for Penelope-owned work.

### 9.1 Current local benchmark

The repository includes a repeatable non-model benchmark:

```bash
npm run benchmark:causal -- 10000 20
```

The command emits a self-describing JSON receipt rather than a hand-copied performance claim. It records event and entity counts, sample and warm-up counts, Node/platform/CPU, Git HEAD and dirty state, selected context size, context-only P50/P95/max, and full append-to-context turn P50/P95/max.

The context measurement covers integrity replay, visibility projection, bounded retrieval, and compact serialization. The full-turn measurement additionally covers exact receipt/ontology authority checks and append preparation for the 10,000th event. Both exclude fixture construction, persistence, networking, and model latency. Machine-local output is diagnostic evidence, not a universal latency promise; a release receipt requires a clean exact commit, deployment-target repetition, and cold-start measurement.

## 10. Failure modes and fail-closed behavior

| Failure mode | Required behavior |
|---|---|
| LLM Wiki summary drifts from facts | Rebuild from ledger; never apply summary text as an effect |
| Event, intent, trigger, or ruling receipt is delivered twice | Reject the consumed receipt; no second append |
| Concurrent writes target the same branch head | One succeeds; stale write must rebase or be rejected |
| Projection sequence/hash lags ledger | Mark projection invalid and rebuild before retrieval |
| Retrieval ranker omits a hard cause or rule | Dependency closure overrides rank and budget |
| Character prompt would include hidden truth | Filter by `CharacterKnowledgeView`; fail closed on uncertain visibility |
| Offscreen packet cascade exceeds budget | Stop at registered cascade bound and surface GM review; do not improvise new effects |
| Irreversible effect lacks rule or GM approval | Do not append; preserve prior branch head |
| Prose generation fails after effects apply | Preserve applied event and receipt; retry rendering without reapplying effects |
| Model proposes an unknown effect kind | Reject schema; no ledger or projection change |
| Cache miss or eviction | Continue normally and record cache telemetry |
| Semantic ambiguity would require repeated retries | Return a targeted GM question; no hidden retry loop |

## 11. Verification ladder

Implementation should proceed only after the current frozen submission evidence is preserved.

1. **Done for ledger/effects/projection:** lock `CampaignEvent`, bounded effect, causal debt, cursor, projection, and working-set schemas with invariant tests. Agenda remains pending.
2. **Done:** implement pure reducers and deterministic event hashing without model or filesystem I/O.
3. **Partial:** append, stale-head, one-shot receipt, duplicate-event, tamper, ontology-membership, and projection-rebuild tests exist. Persistence-level concurrency remains pending.
4. **Partial:** hidden-information and cause-dependency tests exist. Full World Pack rule dependency integration remains pending.
5. Add offscreen trigger, fallback, trace, and cascade-budget tests.
6. Run deterministic 10-, 50-, and 100-turn campaign replays.
7. **Done locally, release receipt pending:** benchmark 10,000 events and 500 entities against the local overhead budgets.
8. Wire one post-core API path and UI surface without changing frozen fixture behavior.
9. Add prompt-cache telemetry, then measure cold and warm live calls separately.
10. Collect representative creator/GM acceptance before deriving any public claim.

Until all relevant gates pass, public wording must remain: **post-core causal ledger and bounded context implemented in the pure domain; UI, API, model-adapter wiring, persistence, and campaign-scale evidence pending**.
