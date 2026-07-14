# Start here

This is the Day 0 scaffold for a Build Week Work & Productivity project. The final product name is intentionally undecided; “Narrative Knowledge Harness” is a technical working label.

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

Implemented in this scaffold:

- Next.js and TypeScript application shell
- strict World Pack and model-draft contracts
- a small public-safe Greek mythology fixture
- fixture/live evidence boundary
- contract tests and CI skeleton
- product, architecture, demo, submission, and evidence plans

The current `app/page.tsx` is a historical Day-0 presentation shell. It still shows the earlier validator-only concept and old working label; it is not evidence of the approved Table workflow and will be replaced during the core build.

Not implemented yet:

- retrieval
- live GPT-5.6 call
- hard validators
- creator accept/edit/reject flow
- canon hashing and versioned overlay
- executable replay runner
- participant/style contracts and intent lineage
- canon/knowledge graph descriptor and view
- bounded two-step simulation scenario and transitions
- end-to-end demo

## Local setup

Requirements: Node.js 22 or newer.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Fixture mode is the default and does not require an API key. Live mode will require `OPENAI_API_KEY`; until the live adapter and smoke evidence exist, fixture output must not be described as GPT-5.6 output.

Run the local gate with:

```bash
npm run verify
```

## Repository map

- `app/`: web presentation and future run endpoint
- `src/domain/`: deterministic schemas and future validation core
- `src/contracts/`: structured model and HTTP contracts
- `src/ports/`: model boundary
- `src/adapters/`: fixture and future GPT-5.6 adapters
- `data/world-packs/`: public-safe demo data
- `tests/`: contract, integration, replay, and later browser checks
- `docs/`: PRD, architecture, evidence, and submission preparation
- `_dev/CORE-BUILD-DISPATCH.md`: clean Codex-session contract for core implementation

## Why this is not README.md yet

This file is a temporary technical entry point. The evidence audit is available, but the product claims are not: the core vertical slice and live GPT-5.6 evidence do not exist yet. A public README will be derived from the verified Evidence Packet after those gates pass, then checked against the repository, Devpost copy, and demo video.

## Official OpenAI implementation sources

- [Using GPT-5.6](https://developers.openai.com/api/docs/guides/latest-model)
- [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [GPT-5.6 prompt guidance](https://developers.openai.com/api/docs/guides/prompt-guidance-gpt-5p6)
