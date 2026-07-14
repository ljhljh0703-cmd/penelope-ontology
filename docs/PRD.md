# Product requirements

## Positioning

Track: Work & Productivity.

Primary audience: professional tabletop game masters, narrative production teams, and game scene or quest designers working with a bounded canon. Writers in bounded-world production are an adjacent audience.

Job to be done: combine several stakeholder or character intents into a usable, voice-directed scene candidate without silently introducing unsupported facts, leaking character-only knowledge, collapsing conflicting source traditions, flattening the creator's style into generic prose, or treating an idea as approved canon.

## Problem

RAG can retrieve relevant text and a model can still produce a polished contradiction or generic prose that ignores the project's narrative voice. The costly step is not drafting alone; it is repeatedly checking who is alive, where an event belongs, what a character can know, which tradition is active, which stylistic constraints apply, and whether a new idea has actually been approved.

## Product hypothesis

If generation exposes claim IDs and proposed state changes, deterministic code can catch a useful class of continuity failures before they enter canon. Creator approval can then separate “interesting suggestion” from “official world state,” and replay can show whether a canon update breaks prior cases.

This is a testable hypothesis, not a claim that the product guarantees coherent or good stories.

## Core workflow

1. The facilitator selects a World Pack, canon profile, fixed state, and an original creator-owned `StyleProfile` describing viewpoint, tense, cadence goals, dialogue mode, explicit avoidances, and output bounds.
2. The live product boundary accepts one or more facilitator-collected `ParticipantIntent` values, each separating the human participant from the fictional entities they control. The public fixture instead loads one registered, frozen two-intent rehearsal so its fixed output cannot be mistaken for free-text composition.
3. Deterministic retrieval creates character-scoped `agent_view` bundles containing only active, relevant entities, claims, events, rules, and knowledge.
4. The fixture path and GPT-5.6 adapter share one strict draft contract for prose, speakers, assertions, actions, proposed changes, and referenced style-constraint IDs. A real model invocation remains a separate local evidence gate.
5. Hard validators check entity existence, state, timeline, location, knowledge, active traditions, support, and expansion approval.
6. The UI exposes deterministic violations, provenance, and proposals through a derived canon/knowledge graph; no second model call owns or imitates the hard gate.
7. New lore is isolated as a proposal. The creator accepts, edits, or rejects it against a specific overlay version and hash.
8. A valid accept/edit returns the complete next overlay and a same-turn rebased `SimulationSnapshot` whose overlay/canon references and state hash match it; this rebase is not a simulation step.
9. Validated actions then produce a deterministic next snapshot; rejected, blocked, or stale input produces no change.
10. The second step runs from Step 1's exact snapshot, and the full replay checks both unchanged controls and the intended red-sail v0/v1 difference.

## MVP acceptance criteria

One web page must demonstrate all of the following with the same small World Pack:

- one grounded scene passes with visible evidence
- one original style profile is visible in the run and referenced through stable registered constraint IDs by the structured draft; this demonstrates an inspectable control mechanism, not improved or superior prose quality
- one registered, frozen two-intent fixture preserves participant, controlled-character, authorizing-intent, contributing-intent, and generated-speaker lineage; arbitrary free-text composition remains a gated live-path claim
- one dead/out-of-place character is blocked
- one character knowledge leak is blocked
- one new rule becomes a proposal rather than canon
- a canon/knowledge graph shows used evidence, missing character knowledge, conflicts, and proposal status
- creator acceptance increments the overlay version and changes the canon hash without rewriting the base pack, then returns a same-turn rebased snapshot bound to that overlay
- only validated actions change registered scenario variables; the snapshot references the approved overlay through version/hash rather than duplicating its rules
- the accepted rule can be used in the second deterministic step
- unchanged control cases keep their expected outcomes, while the red-sail case has explicit pre-approval and post-approval expectations
- the UI clearly labels fixture output and never presents it as a live GPT-5.6 run
- a visible style receipt separates the deterministic output-bound check from creator-reviewed voice and cadence constraints
- a compact knowledge-boundary table shows narrator-visible, character-withheld, and character-uncertain facts without requiring graph interpretation
- a collapsed production review packet organizes intent lineage, evidence, canon delta, state, conflict, and replay for human handoff without claiming production readiness

The hosted demo exposes fixture mode only. Live GPT-5.6 mode is a controlled local/server evidence path, not an unauthenticated public endpoint.

## Success measures

- unsupported claim rate
- canon/knowledge hard-violation rate
- knowledge leak rate
- timeline contradiction rate
- expansion accept/edit/reject counts
- replay regression count
- participant-intent coverage and speaker-ownership mismatch count
- deterministic transition and snapshot-hash mismatch count
- objective style-constraint violations such as output bounds or prohibited phrases, plus a separately labeled human style-rubric result

Creative quality and fun require human judgment; they are not reduced to a single automatic score.

## Non-goals

- all of Greek mythology
- graph database or embeddings
- generic World Pack editor
- remote multiplayer collaboration, voting, presence, or shared canon editing
- long-running autonomous character simulation or memory
- model training, fine-tuning, or DPO
- multi-agent orchestration
- second-model soft review
- living-author imitation or private author-voice training data
- claims that Codex, GPT-5.6, Fable, Opus, or another model is the superior writer without a controlled same-brief human evaluation
- licensed D&D, Call of Cthulhu, or private story assets

## Style-harness hypothesis

The product does not assume that fluent default prose is production-ready prose. Instead of asking Codex or GPT-5.6 to imitate a preferred writer, it turns the creator's own standards into inspectable constraints. World truth, character knowledge, prose style, creator approval, and state change remain separate harness layers. The model receives only the selected bundle; deterministic code checks objective constraints; subjective cadence and voice remain a condition-masked creator rubric. A preregistered same-model `default_instruction_control` versus `profiled` AB/BA probe tests whether registered controllability measures move in the intended direction on that fixed case; it is not a cross-model quality comparison.

## Post-core portfolio runway

After the submission vertical slice and release gates pass, the first product extension is a bounded Quest Brief adapter. It may translate approved canon, participant intents, preconditions, failure conditions, and state transitions into a structured quest-design brief. It must not be called quest automation or a quest generator until a quest contract, representative fixtures, evaluation criteria, and at least one scenario or quest practitioner test exist.
