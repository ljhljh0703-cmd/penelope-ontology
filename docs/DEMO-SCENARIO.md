# Demo scenario

The demo uses `trojan-returns-demo@0.2.0`, one original creator-owned style profile, and the bounded `harbor_watch` simulation scenario. It does not claim coverage of Greek mythology outside the active pack, actual remote collaboration, or model-vendor writing superiority.

## 1. Table setup: people, characters, and style stay separate

The primary flow collects two local synthetic participant inputs:

| Participant | Controlled character | Intent |
|---|---|---|
| `participant.one` | `penelope` | Keep the household from confusing a signal with certainty |
| `participant.two` | `telemachus` | Propose that the harbor watch use a red sail as a return signal |

The selected `style.table_ready_mythic` profile is an original constraint bundle: limited-third viewpoint, present tense, table-ready subtext, uncertainty carried through a playable choice, no living-author imitation, and a fixed output bound.

Expected contract behavior:

- participant IDs are not character IDs
- no character is controlled by two participants
- each generated utterance/action records exactly one `authorizingIntentId` plus optional `contributingIntentIds`
- each `speakerId` or `actorEntityId` maps back to a character controlled by its authorizing intent; contributing intents add context but no authority
- the structured draft references the selected style-constraint IDs

## 2. Character views and structured candidate

The model receives a separate `agent_view` for each controlled character plus the style profile. Penelope's view does not contain the exact Ogygia-location claim; the facilitator audit graph may show that the narrator has the edge while Penelope does not.

GPT-5.6 or the matching fixture produces a bounded scene candidate. Penelope preserves the distinction between signal and certainty; Telemachus proposes the red-sail convention. Every utterance and action remains attributable to input intents and evidence IDs. A separate grounded replay pairs Penelope with Eurycleia.

Expected result before creator action: `needs_creator_decision` with `unapproved_expansion` for the red-sail rule. The rule is original demo canon, not ancient mythology.

## 3. Canon/knowledge graph and creator decision

The facilitator-facing graph shows:

- active source claims and their evidence
- the absence of an Ogygia knowledge edge in Penelope's character view
- source-tradition conflict when the Helen comparison profile is selected
- the red-sail rule as a ghost proposal

The facilitator accepts, edits, or rejects against the current overlay version/hash. Reject or stale input changes nothing. Accept/edit returns the complete next overlay and a same-turn, same-variable rebased snapshot whose overlay/canon references and state hash match it; this rebase is not a simulation step. The immutable World Pack remains `0.2.0`. The proposal becomes an active graph relation only after the valid decision.

## 4. Real two-step simulation

The red-sail rule is approved and S0 is rebased to the approved overlay before the bounded simulation starts. The immutable scenario declares:

```text
harbor_watch: idle → watching → signal_seen
maxSteps: 2
```

Step 1:

- participant intents direct Telemachus to organize the harbor watch
- the candidate `set_variable` action is validated against the current snapshot and approved rule
- state changes from `idle` to `watching`
- `turnIndex` and `stateHash` advance

Step 2:

- the next run consumes Step 1's exact snapshot
- a validated observation advances `watching` to `signal_seen`
- `transition[0].toStateHash` equals `transition[1].fromStateHash`
- the new graph marks the signal state and approved rule as applied

Direct `idle → signal_seen`, a stale `fromStateHash`, an unapproved rule, or a third step is rejected without changing the snapshot.

## 5. Frozen regression panel

The primary demo keeps the following cases as compact replay evidence instead of four disconnected product flows:

- **Grounded Penelope:** passes with visible evidence and no precise Ogygia knowledge
- **Living Hector:** blocked by `entity_state_invalid` and fixed-state presence validation
- **Penelope knows Ogygia:** blocked by `belief_scope_violation`
- **Helen conflict:** returns `needs_creator_decision` with both traditions preserved
- **Red-sail pre-approval:** cannot change overlay or simulation state

After the two-step scenario, all unchanged control cases retain their exact expected outcomes. The red-sail fixture intentionally differs between v0 and v1 and must match both declared expectations.

## 6. Style evidence boundary

The repository preregisters one fixed Penelope/Eurycleia case as two AB/BA pairs. Model, brief, character-scoped evidence, participant intents, output schema, and reasoning effort remain constant. Only `creatorStyleBundle` changes between `default_instruction_control` and `profiled`. Automatic retries and replacement calls are disabled. Objective checks cover registered deterministic constraints; viewpoint, tense, dialogue, cadence, playable uncertainty, and knowledge restraint use a condition-masked creator rubric.

The protocol and evaluator are implemented, but no live four-call capture exists yet. A result may appear in the demo only after the write-once public report is finalized. Even a `supported_on_probe` result would demonstrate limited same-model controllability on this synthetic case; it would not prove that Codex or GPT-5.6 writes better than Fable, Opus, or any other system.
