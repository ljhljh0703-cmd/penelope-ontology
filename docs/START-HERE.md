# Start here

This repository contains the implemented core vertical slice for a Build Week Work & Productivity project. The final product name is intentionally undecided; “Narrative Knowledge Harness” is a technical working label.

For the current status, deadline plan, Go/No-Go gates, and next Codex task boundary, read [`BUILD-WEEK-COMMAND-CENTER.md`](./BUILD-WEEK-COMMAND-CENTER.md).

## Product in one sentence

A rehearsal workbench that combines participant intents inside a creator's world and style, shows the evidence it used, and applies only creator-approved changes to the next state.

The intended users are professional GMs, narrative production teams, writers, and game scenario or quest designers who spend time reconciling multiple intents, generic model prose, and plausible-sounding continuity errors. The product does not claim that a language model “remembers the world” or naturally owns the creator's voice. It builds a visible control path around the model:

```text
ParticipantIntent[] + StyleProfile + World Pack / SimulationSnapshot
→ deterministic retrieval
→ GPT-5.6 structured draft
→ hard validation
→ creator decision
→ derived canon/knowledge graph
→ versioned canon overlay + deterministic transition
→ second snapshot + frozen replay
```

## Current truth

Implemented and fixture-verified:

- a Next.js Table workbench for two local participant intents and one original creator-owned style profile
- strict World Pack, model draft, overlay, decision, graph, simulation, and replay contracts
- deterministic character-scoped retrieval, hard validation, provenance graph, creator decision, hashing, and two-step transition
- a small public-safe Greek mythology fixture with five frozen cases and an eight-stage replay
- a live GPT-5.6 Responses adapter with strict Structured Outputs and typed failure paths
- fixture/live evidence separation, privacy scanning, browser tests, and generated public evidence artifacts
- a clean candidate-copy rehearsal with a reproducible install and full release gate

The public surface defaults to fixture mode. It demonstrates the product flow without spending API credits or presenting fixture output as a live model response.

Not verified or released yet:

- a real GPT-5.6 call and sanitized live-response metadata
- a public hosted deployment
- the final README, which is blocked by a stale local writing-skill manifest rather than product code
- a narrated public demo video, `/feedback` submission field, and final Devpost submission
- practitioner testing or evidence of productivity improvement

## Local setup

Requirements: Node.js 22 or newer.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Fixture mode is the default and does not require an API key. Live mode requires both `ENABLE_OPENAI_LIVE=true` and `OPENAI_API_KEY`; until a real call is captured, fixture output must not be described as GPT-5.6 output.

Run the local gate with:

```bash
npm run verify
```

## Repository map

- `app/`: Table workbench and stateless HTTP endpoints
- `components/table/`: workbench state machine and accessible graph view
- `src/application/`: run orchestration and frozen replay
- `src/domain/`: deterministic retrieval, validation, graph, overlay, and simulation core
- `src/contracts/`: structured model and HTTP contracts
- `src/ports/`: model boundary
- `src/adapters/`: filesystem, fixture, and gated GPT-5.6 adapters
- `data/world-packs/`: public-safe demo data
- `tests/`: contract, unit, API integration, replay, privacy, and browser checks
- `artifacts/evidence/`: sanitized generated fixture evidence and SHA-256 manifest
- `docs/`: PRD, architecture, evidence, and submission preparation
- `_dev/CORE-BUILD-DISPATCH.md`: clean Codex-session contract for core implementation

## Why this is not README.md yet

This file remains the technical entry point because `package-project-evidence` write-mode preflight reported `SERVING_STALE` for the README delegate files. The executable Evidence Packet now exists, but README generation must wait until Vault Claude refreshes that manifest and the preflight passes. Live GPT-5.6 evidence remains a separate pending gate.

## Official OpenAI implementation sources

- [Using GPT-5.6](https://developers.openai.com/api/docs/guides/latest-model)
- [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [GPT-5.6 prompt guidance](https://developers.openai.com/api/docs/guides/prompt-guidance-gpt-5p6)
