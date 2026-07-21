# Start here

This repository contains the implemented core vertical slice for **Penelope Ontology**, a Build Week Work & Productivity project.

Public demo: [penelope-ontology.vercel.app](https://penelope-ontology.vercel.app)

For the current status, deadline plan, Go/No-Go gates, and next Codex task boundary, read [`BUILD-WEEK-COMMAND-CENTER.md`](./BUILD-WEEK-COMMAND-CENTER.md).

## Product in one sentence

**Penelope Ontology lets a creator load a bounded world, change one choice, then trace how that world answers back.**

The primary users are professional GMs, narrative production teams, and game scene or quest designers who need to explore an intervention without losing character knowledge, world facts, creator-owned style, or responsibility for earlier choices. Writers working inside a bounded canon are an adjacent audience, not a separately validated user segment.

The product does not claim that a language model naturally remembers a world or owns the creator's voice. Its world-first path is:

```text
source-grounded world state
→ character knowledge, desire, and local agenda
→ A/B choice or C creator direction
→ C interview: goal, motive, accepted cost
→ canonical execution + creator hash confirmation
→ deterministic world/NPC reaction
→ scoped narration
→ branch ending and replayable checkpoint
```

The product hero is `/`—the same World Workbench exposed at `/world`. It defaults to **The Night of the Scar**, a bounded one-night simulation from *The Odyssey*, Book 19, and can switch to **Behind the Green Screen** from *The Wonderful Wizard of Oz*, Chapter XV. It can also import a prepared creator-owned JSON World Pack into temporary session memory. The Story Workbench at `/story` and the Table rehearsal at `/table` are supporting surfaces.

## The demo in 30 seconds

Odysseus has returned to Ithaca in disguise. Penelope is interviewing him; Eurycleia is about to recognize the scar on his leg; Melantho is hostile, present, and looking for an advantage.

The creator uses C to dismiss Melantho and make the interview private. Penelope asks what this action seeks, why it happens now, and what cost the creator accepts. The creator confirms the world-compatible execution. Melantho does not learn Odysseus's identity for free, but the exclusion gives her a reason to investigate a later visible disturbance. If Eurycleia's recognition is exposed, the branch can reach `Plan Compromised`.

From the same local checkpoint, the containment route can instead reach `Canon Contained`. This is the product claim: a different intervention produces a different causal world line, not merely different prose.

## Why Penelope Ontology

Penelope waits, observes, and tests before she treats a claim as truth. **Penelope Ontology refuses to mistake a generated draft for canon.** Model output may propose what could happen, but only traceable world evidence and creator approval may change what is true.

“Ontology” refers here to the explicit structure connecting characters, claims, source traditions, knowledge boundaries, creator rules, and world states. It does not claim a graph database, RDF/OWL implementation, or formal Semantic Web compliance; the current visual surface is a derived canon/knowledge graph.

## Current truth

Implemented and fixture-verified:

- `/world` as the world-first root route: a source-bounded Book 19 simulation with session-scoped checkpoints, A/B suggestions, C creator direction, canonical-execution hash confirmation, endings, creator-only risk receipts, and narration review
- a sealed, versioned World Pack contract plus two registered public-domain packs with different casts, sources, actions, reactions, hidden knowledge, and endings
- strict creator-owned JSON import within a 262,144-byte complete session-request limit, server-computed digest, session checkpoint binding, registered-ID collision rejection, and root-fixed 30-minute server-memory retention
- C interview questions for goal, motive, and accepted cost; incomplete, ambiguous, or unsupported C cannot change world state and is never silently substituted with A or B
- typed world state, character drives and knowledge boundaries, creator-owned prose profile, scene contracts, resolution envelopes, scoped narration, and deterministic replay
- Book 19 fixture rules that distinguish source-grounded facts from creator-approved IF rules; Melantho reacts to visible exclusion and disturbance rather than receiving hidden identity knowledge for free
- narration approval, edit, and rejection flow where prose cannot rewrite resolved events or causal receipts
- session-scoped world-line checkpoints for returning to a shared past and testing a different consequence
- The Loom: a dismissible, scrollable transition whose heading distinguishes resolving, review, accepted, and failed states; it reports only receipt-backed consequences and never claims a rejected choice entered the world
- World Aftermath: creator choice, declared causal world response, typed state delta, and renewed story pressure derived from the causal receipt
- World Forge: a two-to-three-sentence intake expanded through 24 creator approvals into a session-private five-scene episode with one bounded relationship axis
- World Codex: a creator-only observatory for the current dramatic question, cumulative approved and realized plot beats, dynamic relationship history, ending-condition status, and parent-child checkpoint lineage
- compact NPC cards for each relevant NPC's position, agenda, and private-knowledge boundary
- Fork Compare: side-by-side state comparison of two world lines from a shared checkpoint, including knowledge, movement, pressure, rules, risks, and endings
- a local four-turn Book 19 run through the Codex CLI narration path, requesting `gpt-5.6-terra`: two weak drafts failed closed without changing world state, while four final candidates passed the deterministic harness without manual rewriting
- deterministic retrieval, hard validation, provenance graph, creator decision, hashing, transition, replay, fixture/live evidence separation, and privacy scanning
- current portable-world verification covers evidence regeneration and verification, lint, typecheck, unit and integration tests, privacy scanning, production build, trace-privacy inspection, and production browser checks across desktop Chromium and mobile WebKit
- the public GitHub release, CI, and credential-free hosted demo are recertified per commit through an ignored release record rather than self-certified by this tracked document

Not independently verified:

- independently reported serving-model identity; current completed local evidence is a Codex CLI generation lane that requested `gpt-5.6-terra`
- human creator literary acceptance of the final live prose; automated gates do not substitute for that judgment
- practitioner testing or evidence of productivity improvement

## Local setup

Requirements: Node.js 22.x and npm.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Fixture mode is the default and requires no API key.

| Route | Purpose |
|---|---|
| `/` or `/world` | Product workbench: Book 19, Oz, or a session-scoped creator pack; creator C interview, checkpoints, and consequences |
| `/story` | Supporting prepared A/B story-workbench flow |
| `/table` | Supporting forensic fixture: provenance, canon proposal, graph, and replay |

### Optional local Codex CLI generation

The current story and world narration lanes request `gpt-5.6-terra` through the locally authenticated Codex CLI for structured scene candidates. The CLI transport does not independently expose the serving-model identity, so repository copy reports the requested model and leaves `actualModel` unset.

```bash
npm run story:demo -- --transport codex_cli --branch quiet
```

To enable the local browser's **Live Codex** selector, generate a private token and add it to `.env.local`:

```dotenv
PENELOPE_STORY_CODEX_CLI_ENABLED=1
PENELOPE_STORY_CODEX_CLI_TOKEN=<at-least-32-byte-private-token>
```

The live browser route accepts loopback requests only. The token stays in tab memory, is sent as a private header, and is excluded from story receipts. Never commit `.env.local` or Codex authentication data.

## How Codex and GPT-5.6 were used

The creator defined the product problem, Book 19 world-control principles, prose judgment, and final scope. Codex translated those decisions into typed contracts, deterministic validators, causal state transitions, UI flows, adversarial tests, evidence gates, and release tooling.

Codex was designated to use GPT-5.6 for the Build Week implementation task. The current generation lanes request GPT-5.6 Terra through the local Codex CLI for structured scene candidates; deterministic code—not model prose—owns validation, state change, canon promotion, and consequence tracking. The CLI does not independently report serving-model identity, so this project does not claim an independently verified model identity or a Responses API trace.

## Verification

```bash
npm run verify
npm run test:browser:production
```

After the local candidate is committed and recertified, fill the gitignored private submission record only with facts that have actually been verified, then run:

```bash
npm run submission:check
npm run submission:check:post
```

## Repository map

- `app/`: Story, World, and Table workbenches plus stateless HTTP endpoints
- `components/world/`: portable World Pack simulation UI
- `components/story/`: prepared story-workbench surface
- `components/table/`: forensic workbench and accessible graph view
- `src/application/`: turn orchestration and frozen replay
- `src/domain/`: deterministic world, validation, graph, overlay, and simulation core
- `src/contracts/`: structured model and HTTP contracts
- `src/adapters/`: fixture and gated Codex CLI adapters
- `src/submission/`: strict private-record contract and final-readiness evaluation
- `tests/`: contract, unit, API integration, replay, privacy, and browser checks
- `docs/submission/`: Devpost and video preparation

## Evidence boundaries

- Fixture output is labeled as fixture output.
- A requested model is not presented as independently verified serving-model identity.
- Automated acceptance is not presented as a creator's literary verdict.
- New lore remains a proposal until the creator approves it.
- No cross-model writing-superiority or productivity-improvement claim is made.
- Graph views are derived knowledge/canon views; the project does not claim a graph database or formal Semantic Web implementation.
- Imported definitions use temporary server memory and are not persisted, but the hosted demo is not a confidential manuscript service.
