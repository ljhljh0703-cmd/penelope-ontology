# Story WOW vertical slice dispatch

Date: 2026-07-16
Branch: `codex/story-wow-vertical-slice`
User direction: approved in the active Codex task on 2026-07-16

## Objective

Turn Penelope Ontology from a fixture-first proof surface into a story-first creator workbench:

```text
bounded user choice
→ narrative resolution
→ causal effects
→ live next-scene prose
→ choice echo in a later scene
→ small-arc ending
```

The product is not primarily a dice, item, condition, or GM-rule engine. Those are optional adapters that produce the same `ResolutionEnvelope`. The core product keeps the story moving while preserving character drives, world facts, creator-owned style, and responsibility for earlier choices.

## Product sentence

**Penelope Ontology carries a creator's choice through character, world, and prose until the story pays it off.**

## Research basis

- Internal design note: structured characters become active story material rather than static lore.
- Internal design note: define the felt result and hard constraints instead of over-prescribing the model's process.
- Internal design note: every scene changes something; delayed consequences must be made visible; remove detail that does not change the story.
- Zeta official product material: preserve scene-to-scene momentum, direct input plus suggested continuations, creator-controlled style, and relevance-triggered lore rather than injecting the whole world every turn.
- OpenAI official guidance: keep production prompts in typed code, place stable instructions/context before dynamic input, use GPT-5.6 Structured Outputs, and evaluate prompt behavior rather than assuming prose quality.

## Demo: The Red Sail Trilogy

Scope: one island, one night, three scenes.

Central dramatic question: Can Ithaca act on a signal without mistaking it for proof?

Scene 1 presents a red sail and two choices:

- `ring_public_bell`: more protection, rumor spreads, later signals become ambiguous.
- `keep_quiet_watch`: rumor stays contained, Telemachus carries greater personal risk, a later answering light becomes meaningful evidence.

The primary demo selects `keep_quiet_watch`.

- Scene 1 opens `debt.penelope_to_telemachus` and raises `telemachus_exposure`.
- Scene 2 returns both the benefit and cost: silence isolates Telemachus but makes the hidden lamp intentional.
- Scene 3 pays off the original choice: a decoy lamp exposes the watcher, the ship retreats, Penelope acknowledges the human cost, and the red-sail question closes. One residual hook remains: who hired the spy?

## Core contracts

### StorySpine

- premise
- dramatic question
- target ending
- maximum scene count
- current beat
- open threads
- must-pay-off obligations
- forbidden resolutions

### CharacterDrive

- desire
- fear
- tactic
- red line
- relationship pressure

### ResolutionEnvelope

- authority: user choice, GM ruling, dice, condition, item, or world rule
- outcome: success, success with cost, failure with progress, or catastrophic failure
- bounded causal effects
- opened or resolved causal debts
- evidence references

### SceneContract

- focal character
- goal and opposition
- inherited consequences
- required dramatic turn
- state delta
- forward pressure
- closed and opened threads

Every accepted scene must:

1. begin under active pressure;
2. put character desires into conflict;
3. change at least one state;
4. return at least one benefit or cost from a prior choice;
5. end with a concrete action, discovery, deadline, or remaining obligation;
6. close the central question by scene three while leaving at most one residual hook.

Missing information never stalls the story. Unsupported world expansion remains a folded proposal; the scene continues from approved facts, character drives, and time pressure.

## Runtime lanes

Keep the current `/` fixture and evidence endpoints unchanged during development.

Add `/story` as the product slice:

```text
POST /api/story/session
POST /api/story/turn
```

Model transports remain distinct:

- fixture: deterministic public-safe three-scene replay;
- Codex CLI: local ChatGPT-authenticated live story generation through `codex exec --output-schema --output-last-message`, with no JSON-event dependency;
- Responses API: server-key-gated GPT-5.6 path when API access is configured.

Never relabel one transport as another.

## Knowledge boundary repair

The existing live narrative input must not pass all character views and their combined context to one writer call.

The story slice uses three layers:

1. data minimization: a focal/scene scope contains only narrator-safe facts and facts shareable by present speakers;
2. structured prose segments: every dialogue or narration segment declares its grounding claims and echoed consequences;
3. post-generation semantic grounding audit: each proposition must map to the allowed scope; unsupported or contradicted prose cannot commit the provisional causal ledger.

The exact Ogygia bypass becomes a permanent regression.

## UI contract

The user sees, in this order:

1. story prose;
2. direct action input plus two folded continuation candidates;
3. `What changed` consequence chips;
4. the next scene and visible return of a prior choice;
5. optional `Why this followed` drawer with claims, drives, causal debts, hashes, and model provenance.

Hashes and receipts are evidence, not the hero.

## Writing quality gate

Machine checks:

- 110–220 English words per scene;
- at least one state change;
- at least one causal reference after scene one;
- concrete closing pressure;
- no unsupported or character-private fact;
- central question closed by scene three.

Creator rubric, 1–5:

- distinct character voices;
- dialogue subtext;
- sentence rhythm appropriate to tension;
- controlled image recurrence;
- causal satisfaction;
- fair benefit and cost;
- irreversible scene progress;
- immediate playability.

No cross-model superiority claim. The product may show same-model control versus harnessed output only after its preregistered evidence exists.

## Implementation order

1. lock story contracts and failing tests;
2. implement scoped context and the Ogygia regression;
3. map resolutions to the existing causal ledger;
4. implement fixture and Codex CLI story transports;
5. add story session/turn APIs;
6. add the story-first `/story` workbench;
7. prove two-turn consequence echo and three-scene closure;
8. run local verification, browser flow, and one live Codex CLI generation;
9. after creator prose review, update the README/video/submission evidence.

## Done gate

- current fixture bytes and endpoints remain valid;
- exact Ogygia hidden-fact attack is blocked;
- editable action produces a next scene;
- turn two includes and visibly pays off a turn-one causal effect;
- unsupported action fails forward instead of stalling;
- three-scene fixture closes the Red Sail question;
- `LIVE` appears only with a completed live trace;
- `npm run verify` and the story browser test pass;
- live prose is reviewed by the creator before any writing-quality claim.

## Product claim

Use:

> **Built with Codex. Written live with GPT-5.6. Remembered by Penelope.**

For the Codex CLI lane, label it accurately as Codex CLI output and retain its requested model separately from independently verified runtime-model metadata.
