# Penelope Ontology

**A causal world simulator for creators: change one choice, then watch the world—not just the paragraph—answer back.**

[Try the public demo](https://penelope-ontology.vercel.app) · [Browse the source](https://github.com/ljhljh0703-cmd/penelope-ontology)

Penelope Ontology is a Work & Productivity tool for narrative designers, quest teams, professional GMs, and writers working inside a bounded canon. It lets a creator test an intervention, then traces what each important character knows, wants, notices, and does next before rendering the scene.

The demo is **The Night of the Scar**, a bounded simulation set in *The Odyssey*, Book 19. This is not a TRPG rules engine and not a generic story generator. Dice and game-specific checks may be added as optional authorities; the core product is a creator-governed causal world model.

## The problem

Fluent prose is not the same as a usable story system. A model can write an attractive scene while:

- revealing information a character cannot know;
- turning an unverified signal into fact;
- forgetting the benefit or cost of a prior choice;
- inventing lore and silently treating it as canon;
- moving every character with one narrator's authority.

Penelope separates those responsibilities. The creator owns direction, taste, and canon decisions. The engine owns bounded world judgment, character knowledge, causal bookkeeping, and deterministic execution. Prose is the expression of that result—not the authority that makes it true.

## How it works

```text
creator selects A, the recommended route, or B, a meaningful alternative
→ or uses C to state a new intervention through goal, motive, and cost questions
→ Penelope proposes a world-compatible execution; the creator confirms its hash
→ typed effects, knowledge changes, risks, and NPC reactions are resolved
→ the world advances from the same checkpoint on a visible branch
→ only relevant character and world knowledge enters narration
→ the branch closes with the consequence it earned
```

### Three ways to continue

- **A · Recommended** follows the strongest route available in the current situation.
- **B · Alternative** offers a materially different benefit, cost, or strategy. It is not automatically the dangerous route.
- **C · Creator direction** opens the World Workbench. It asks what the character wants, why they act now, and what cost they will accept before it proposes a world-compatible move.

A and B make the recommended route and a meaningful alternative explicit; their actual consequences appear only after the world resolves them. C remains unexecuted until the creator reviews its canonical execution and confirms the visible state-bound receipt. An incomplete, ambiguous, or unsupported C leaves world state unchanged.

### The creator can see behind the curtain

Reader-facing prose stays inside the scene. Creator-facing receipts separately expose latent risks such as a possible overhearer, a hidden clock, or a consequence that has not fired yet. These are warnings and control inputs, not facts smuggled into narration.

Dialogue authority is also explicit. Each speaker and speech event must be licensed independently, so one valid line does not give the narrator permission to speak for everyone in the scene.

## Demo: The Night of the Scar

Odysseus has returned to Ithaca in disguise. During Penelope's night interview, Eurycleia is about to wash the stranger's feet and recognize an old scar. Penelope does not yet know who he is. Eurycleia, Odysseus, and Melantho each carry different knowledge and competing incentives.

The decisive IF is deliberately small: **Penelope sends Melantho away to make the interview private.** That buys privacy, but the exclusion gives Melantho a reason to investigate offstage. When Eurycleia reacts to the scar, Melantho can turn a visible disturbance into a reportable threat. The branch can end as `Plan Compromised`.

Return to the same checkpoint and take the containment route instead: Eurycleia recognizes Odysseus, he contains the reaction, and the branch ends `Canon Contained`.

> **You removed the witness. You created an investigator.**

That contrast is the demo's point. Penelope does not reward a plausible request with a convenient scene; it calculates how a bounded world responds to the conditions the creator changed.

The `/world` workbench is the product hero. It collects C's goal, motive, and accepted cost; exposes a world-compatible proposal, canonical execution, and short state-bound receipt; and requires confirmation before execution. Incomplete, ambiguous, or unsupported C leaves world state unchanged. Narration candidates remain outside canon until creator approval, while typed world state and causal receipts remain authoritative.

### What the demo proves

1. **Source-grounded world, not unlimited lore.** The fixture models one night in Book 19, with the original source facts and creator-approved IF rules visibly distinguished.
2. **NPCs act from local causes.** Melantho does not receive Odysseus's identity for free; she responds to exclusion, visible disturbance, and her own agenda.
3. **Forks remain inspectable.** Browser-local checkpoints preserve the shared past so a creator can run a different consequence from the same moment.
4. **Creator agency is real.** C never silently becomes A or B. Penelope asks what the creator wants, why the character acts now, and what cost is acceptable before proposing anything.

`World Pulse` makes the causal receipt legible after each turn: creator choice, world response, state change, and renewed story pressure. Compact NPC cards expose each relevant character's position, agenda, and private-knowledge boundary. `Fork Compare` places two world lines from a shared checkpoint beside each other and compares state—not prose—including knowledge, movement, pressure, rules, latent risks, and endings.

## Run locally

Requirements: Node.js 22 and npm.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

| Route | Purpose |
|---|---|
| `/` or `/world` | Product demo: Book 19 world simulation, C interview, causal receipts, and fork comparison |
| `/story` | Supporting prepared A/B story-workbench flow |
| `/table` | Forensic fixture view: knowledge, evidence, canon proposal, and replay |

Fixture mode is the default and requires no API key.

### Optional local Codex CLI generation

The current story and world narration lanes request `gpt-5.6-terra` through the locally authenticated Codex CLI. The CLI transport does not independently expose the serving-model identity, so the product reports the requested model and leaves `actualModel` unset.

Run the bounded story demo directly:

```bash
npm run story:demo -- --transport codex_cli --branch quiet
```

To enable the browser's local **Live Codex** selector, generate a private token and add it to `.env.local`:

```dotenv
PENELOPE_STORY_CODEX_CLI_ENABLED=1
PENELOPE_STORY_CODEX_CLI_TOKEN=<at-least-32-byte-private-token>
```

The live browser route accepts loopback requests only. The token stays in tab memory, is sent as a private header, and is excluded from story receipts. Never commit `.env.local` or Codex authentication data.

A local Book 19 proof run used this browser path for four consecutive narration turns across the compromised and contained branches. Two weak candidates were rejected—one for an ambiguous pronoun and one for treating a place as an acting subject—and neither changed world state. The four final candidates passed the deterministic harness and delegated English-language QA without manual rewriting. This is transport and harness evidence, not a human creator's literary verdict, and the serving-model identity remains unverified.

A frozen W5 comparison remains pinned to `gpt-5.6-sol` as historical evaluation material. It is not the current product model.

## How Codex and GPT-5.6 were used

The creator defined the product problem, narrative model, world-control principles, prose judgment, and final scope. Codex translated those decisions into typed contracts, deterministic validators, causal state transitions, UI flows, adversarial tests, evidence gates, and release tooling.

Codex was designated to use GPT-5.6 for the Build Week implementation task. The current generation lanes request GPT-5.6 Terra through the local Codex CLI for structured scene candidates; deterministic code—not model prose—owns validation, state change, canon promotion, and consequence tracking. The CLI does not independently report serving-model identity, so this repository reports the requested model and does not claim a Responses API trace.

## Verification

```bash
npm run verify
npm run test:browser:production
```

The release candidate passed the complete clean-worktree gate: evidence regeneration and verification, lint, typecheck, 94 Vitest files with 833 tests, a 383-file privacy scan, production build, all seven focused World Playwright checks, and all 38 production browser checks across desktop Chromium and mobile WebKit. The causal browser path dismisses Melantho through C, collects all three creator answers, confirms the canonical execution, reaches `Plan Compromised`, returns to opening, reaches `Canon Contained`, and compares both lines. The public repository passes GitHub CI, and the hosted fixture passed the cache-busted exact-SHA deployment smoke covering build identity, security headers, approved-overlay replay, two-step transition continuity, and public-live denial. Those proofs are rerun for every later release commit.

## Evidence boundaries

- Fixture output is labeled as fixture output.
- A requested model is not presented as independently verified serving-model identity.
- Automated acceptance is not presented as a creator's literary verdict.
- New lore remains a proposal until the creator approves it.
- No cross-model writing-superiority or productivity-improvement claim is made.
- Graph views are derived knowledge/canon views; the project does not claim a graph database or formal Semantic Web implementation.

For architecture and claim details, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/OPENAI-USAGE.md](docs/OPENAI-USAGE.md), and [docs/EVIDENCE-LEDGER.md](docs/EVIDENCE-LEDGER.md).

## License

MIT — see [LICENSE](LICENSE).
