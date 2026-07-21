# Devpost project description — final

Project name: Penelope Ontology

## What it is

Penelope Ontology is a creator-governed causal world simulator for narrative designers, quest teams, professional game masters, and writers working inside a bounded canon. It lets a creator change one decision, then follows the effects through character knowledge, competing motives, offstage reactions, and the ending that those conditions earn. Its harness keeps that bounded world inspectable while the creator owns direction and taste; Penelope controls plausibility, causal consequences, and what the world is allowed to treat as true. It is not a TRPG rules engine or a generic next-paragraph generator.

## How it works

The World Workbench starts from a bounded world checkpoint, not an empty prompt. A is the recommended route, B is a materially different alternative, and C is the creator's own direction. A/B make recommendation versus alternative explicit, while World Pulse shows the consequence the simulation actually resolves. C asks for the character's goal, motive, and accepted cost, then presents a world-compatible proposal, canonical execution, and visible state-bound receipt for approval. The supporting Story Workbench rehearses prepared A/B prose, but authoritative world state lives in the World Workbench.

Each creator instruction is retained as a typed intent before validation and resolution, so the eventual consequence can be traced back to what the creator actually asked for.

The selected action becomes typed effects, knowledge changes, risks, debts, clocks, and open obligations. The simulation advances the small set of important NPCs from their own local knowledge and agendas. Only knowledge available to the focal character and current world state enters the narration contract. Each dialogue event is licensed to a specific speaker. Creator-only receipts separately expose behind-curtain risks such as a possible overhearer, so warnings do not leak into reader-facing prose as facts.

New lore remains a proposal until creator approval. Deterministic validators own knowledge boundaries, state change, canon promotion, and consequence tracking. The model proposes, the harness constrains and traces, and the creator decides.

## Demo

**The Night of the Scar** fixes one scene to selected events from *The Odyssey*, Book 19: Odysseus has returned in disguise, Penelope is interviewing him, and Eurycleia is about to discover the scar that reveals him. The interview, washing, recognition, and Penelope's continued uncertainty are source-grounded. Melantho's investigation and the alternate endings are visibly labeled creator-authored IF rules, not Homeric canon. The playable scope is one night, not the whole epic.

The creator makes an apparently sensible intervention: dismiss Melantho to make the interview private. Penelope asks the creator to state the goal, motive, and accepted cost, then presents the canonical execution for confirmation. Once approved, Melantho leaves the interview—but the exclusion gives her reason to investigate elsewhere in the household. When Eurycleia reacts to the scar, that visible disturbance can become a reportable threat. The branch reaches `Plan Compromised`.

From the same preserved checkpoint, the creator can take the containment route instead. Eurycleia recognizes Odysseus, he contains the reaction, and the branch closes as `Canon Contained`. The result is not merely two alternative paragraphs: it is two auditable world lines with different knowledge, movement, risks, and endings.

World Pulse makes the causal receipt legible after each turn: creator choice, world response, state change, and renewed story pressure. NPC cards show each relevant character's position, agenda, and private-knowledge boundary. Fork Compare then contrasts the two completed branches from their shared checkpoint using recorded knowledge, movement, pressure, rules, latent risks, and endings—not a prose similarity score.

The World Workbench keeps typed state authoritative. C remains unchanged when incomplete, ambiguous, or unsupported; it is never silently substituted with A or B. Only a reviewed canonical execution with a matching hash can run. Narration candidates wait outside canon for approval, multiple speakers keep separate authority, and latent disclosure risks remain visible to the creator behind the curtain. The Table route remains supporting evidence for provenance and deterministic replay.

## Hardest problem

The difficult part was not producing fluent text. It was making a world answer a creator's intervention without becoming either a rigid script or an unbounded agent simulation. A plausible paragraph can reveal private knowledge, erase the cost of a choice, move a character without permission, or make invented connective lore sound canonical. Prompt wording alone does not make those failures inspectable. I separated creative judgment from hard invariants, bounded the simulation to the people and facts that matter in this scene, made state and speech changes traceable, and required consequence payoffs inside a short arc. Missing certainty now becomes a visible decision or risk, not an invented bridge.

## Why Codex and GPT-5.6

I supplied the product direction, narrative design, world-control principles, prose judgment, and final scope. Codex turned those decisions into schemas, validators, causal ledgers, UI states, adversarial tests, private review packets, and release gates. That work converted feedback such as “the story must continue, but the world must not bend for free” into executable contracts.

Codex was designated to use GPT-5.6 for the Build Week implementation task. The current local story and world narration lanes request `gpt-5.6-terra` through the locally authenticated Codex CLI for structured scene candidates. In the final Book 19 proof, four narration turns completed across the compromised and contained branches without manual rewriting. Two earlier drafts were rejected by the harness, and neither changed world state. A frozen W5 comparison remains pinned to `gpt-5.6-sol` as historical evaluation material. The CLI transport does not independently expose the serving-model identity, so the project reports the requested model and does not relabel it as a Responses API trace. Delegated English-language QA is not presented as human creator literary acceptance. Deterministic code—not model prose—owns validation, canon, state transition, and consequence tracking.

## Built with

Codex, GPT-5.6 through the Codex CLI requested-model lane, TypeScript, Next.js, React, Zod, Vitest, Playwright, and GitHub Actions.
