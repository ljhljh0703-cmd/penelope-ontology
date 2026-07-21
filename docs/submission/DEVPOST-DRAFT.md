# Devpost project description — final

Project name: Penelope Ontology

## What it is

Penelope Ontology is a portable, creator-governed causal story simulator for narrative designers, quest teams, professional game masters, and writers working inside a bounded canon. It lets a creator load one bounded World Pack, change a decision, then follows the effects through character knowledge, competing motives, declared reactions, and the ending that those conditions earn. Its harness keeps the world inspectable while the creator owns direction and taste; Penelope controls plausibility, causal consequences, and what the world is allowed to treat as true. It is not a TRPG rules engine, an unlimited next-paragraph generator, or a long-running agent society.

## How it works

The World Workbench starts from a sealed, versioned World Pack and bounded checkpoint, not an empty prompt. A is the recommended route, B is a materially different alternative, and C is the creator's own direction. A/B make recommendation versus alternative explicit. C asks for the character's goal, motive, and accepted cost, then presents a world-compatible proposal, canonical execution, and visible state-bound receipt for approval. When an action actually enters resolution, The Loom shows the world processing it; World Aftermath then exposes only the consequence the causal receipt recorded. The supporting Story Workbench rehearses prepared A/B prose, but authoritative world state lives in the World Workbench.

Each creator instruction is retained as a typed intent before validation and resolution, so the eventual consequence can be traced back to what the creator actually asked for.

The selected action becomes typed effects: knowledge changes, flags, clocks, movement, and agenda-state changes. Declared NPC reactions run only when their local knowledge and current state satisfy a registered rule. Only knowledge available to the focal character and current world state enters the narration contract. Each dialogue event is licensed to a specific speaker. Creator-only receipts separately expose behind-curtain risks such as a possible overhearer, so warnings do not leak into reader-facing prose as facts.

New lore remains a proposal until creator approval. Deterministic validators own knowledge boundaries, state change, canon promotion, and consequence tracking. The model proposes, the harness constrains and traces, and the creator decides.

The public selector ships two different source-bounded packs: *The Odyssey*, Book 19 and *The Wonderful Wizard of Oz*, Chapter XV. A creator can also import a schema-valid JSON definition inside a session-start request no larger than 262,144 UTF-8 bytes. The server seals it with a canonical digest and binds every checkpoint to its ID, version, and digest, so a child branch cannot silently switch worlds. Imported definitions remain outside the registered pack list and expire from server memory after 30 minutes. The hosted demo is not a confidential manuscript store; sensitive creator IP should be tested in a local self-hosted copy.

## Demo

**The Night of the Scar** fixes one scene to selected events from *The Odyssey*, Book 19: Odysseus has returned in disguise, Penelope is interviewing him, and Eurycleia is about to discover the scar that reveals him. The interview, washing, recognition, and Penelope's continued uncertainty are source-grounded. Melantho's investigation and the alternate endings are visibly labeled creator-authored IF rules, not Homeric canon. The playable scope is one night, not the whole epic.

The creator makes an apparently sensible intervention: dismiss Melantho to make the interview private. Penelope asks the creator to state the goal, motive, and accepted cost, then presents the canonical execution for confirmation. Once approved, Melantho leaves the interview—but the exclusion gives her reason to investigate elsewhere in the household. When Eurycleia reacts to the scar, that visible disturbance can become a reportable threat. The branch reaches `Plan Compromised`.

From the same preserved checkpoint, the creator can take the containment route instead. Eurycleia recognizes Odysseus, he contains the reaction, and the branch closes as `Canon Contained`. The result is not merely two alternative paragraphs: it is two auditable world lines with different knowledge, movement, risks, and endings.

World Aftermath makes the causal receipt legible after each turn: creator choice, world response, state change, and renewed story pressure. World Codex gathers the current dramatic question, character desires and changes, explicitly declared relationship edges, event chain, pressure clocks, possible endings, and checkpoint lineage into a creator-only observatory. NPC cards show each relevant character's position, agenda, and private-knowledge boundary. Fork Compare then contrasts the two completed branches from their shared checkpoint using recorded knowledge, movement, pressure, rules, latent risks, and endings—not a prose similarity score.

The World Workbench keeps typed state authoritative. C remains unchanged when incomplete, ambiguous, or unsupported; it is never silently substituted with A or B. Only a reviewed canonical execution with a matching hash can run. Narration candidates wait outside canon for approval, multiple speakers keep separate authority, and latent disclosure risks remain visible to the creator behind the curtain. The Table route remains supporting evidence for provenance and deterministic replay.

The short **Behind the Green Screen** pack proves that Ithaca is not hidden in the runtime. It brings a different cast, source, secret, action vocabulary, reaction chain, and ending logic from Oz Chapter XV. World Forge can also take a two-to-three-sentence seed, ask for the bounded facts it still needs, require creator review of all 17 fields, and compile one session-private pack. The demo can then import **The Lantern Ledger**, a creator-attested original public-safe starter pack, and run its own action, reaction, and ending through the same workbench. These are portability proofs, not claims that arbitrary prose is automatically converted without review or that the engine simulates either book in full.

## Hardest problem

The difficult part was not producing fluent text. It was making more than one world answer a creator's intervention without becoming either a rigid script or an unbounded agent simulation. A plausible paragraph can reveal private knowledge, erase the cost of a choice, move a character without permission, or make invented connective lore sound canonical. A hard-coded demo can also mistake one story's names for universal engine rules. I separated creative judgment from hard invariants, moved story-specific behavior into sealed packs, made state and speech changes traceable, and required consequence payoffs inside a short arc. Missing certainty now becomes a visible decision or risk, not an invented bridge.

## Why Codex and GPT-5.6

I supplied the product direction, narrative design, world-control principles, prose judgment, and final scope. Codex turned those decisions into schemas, validators, causal ledgers, UI states, adversarial tests, private review packets, and release gates. That work converted feedback such as “the story must continue, but the world must not bend for free” into executable contracts.

Codex was designated to use GPT-5.6 for the Build Week implementation task. The current local story and world narration lanes request `gpt-5.6-terra` through the locally authenticated Codex CLI for structured scene candidates. In the final Book 19 proof, four narration turns completed across the compromised and contained branches without manual rewriting. Two earlier drafts were rejected by the harness, and neither changed world state. A frozen W5 comparison remains pinned to `gpt-5.6-sol` as historical evaluation material. The CLI transport does not independently expose the serving-model identity, so the project reports the requested model and does not relabel it as a Responses API trace. Delegated English-language QA is not presented as human creator literary acceptance. Deterministic code—not model prose—owns validation, canon, state transition, and consequence tracking.

## Built with

Codex, GPT-5.6 through the Codex CLI requested-model lane, TypeScript, Next.js, React, Zod, Vitest, Playwright, and GitHub Actions.
