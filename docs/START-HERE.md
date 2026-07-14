# Start here

This repository contains the implemented core vertical slice for a Build Week Work & Productivity project. The final product name is intentionally undecided; “Narrative Knowledge Harness” is a technical working label.

For the current status, deadline plan, Go/No-Go gates, and next Codex task boundary, read [`BUILD-WEEK-COMMAND-CENTER.md`](./BUILD-WEEK-COMMAND-CENTER.md).

## Product in one sentence

A rehearsal workbench that traces a registered fixture bundle—or gated live intent bundle—through a creator's world and style, shows the evidence it used, and applies only creator-approved changes to the next state.

The primary users are professional GMs, narrative production teams, and game scene or quest designers who spend time reconciling multiple intents, generic model prose, and plausible-sounding continuity errors. Writers working inside a bounded canon are an adjacent audience, not a separately validated user segment. The product does not claim that a language model “remembers the world” or naturally owns the creator's voice. It builds a visible control path around the model:

```text
registered fixture ParticipantIntent[2] / gated live ParticipantIntent[]
+ StyleProfile + World Pack / SimulationSnapshot
→ deterministic retrieval
→ fixture structured draft / gated GPT-5.6 structured draft
→ hard validation
→ creator decision
→ derived canon/knowledge graph
→ versioned canon overlay + deterministic transition
→ second snapshot + frozen replay
```

## Current truth

Implemented and fixture-verified:

- a Next.js Table workbench that replays one registered, frozen two-intent fixture with one original creator-owned style profile
- strict World Pack, model draft, overlay, decision, graph, simulation, and replay contracts
- deterministic character-scoped retrieval, hard validation, provenance graph, creator decision, hashing, and two-step transition
- a small public-safe Greek mythology fixture with five frozen cases and an eight-stage replay
- a live GPT-5.6 Responses adapter with strict Structured Outputs and typed failure paths
- fixture/live evidence separation, privacy scanning, browser tests, and generated public evidence artifacts
- a preregistered same-GPT-5.6 style-control AB/BA protocol with no automatic retries, condition-masked creator ratings, and a write-once public report
- an exact-SHA release rehearsal and deployment smoke reproduced in both the working repository and a clean clone; the post-commit identity is kept in the ignored local release record

The public surface is fixture-only. It demonstrates the product flow without spending API credits or presenting fixture output as a live model response.

Not verified or released yet:

- a real GPT-5.6 call and sanitized live-response metadata
- the four-call style capture and creator ratings; the public readiness artifact currently says `not_executed`
- a public hosted deployment
- the final README, whose approved writing pipeline is currently `SERVING_CANDIDATE` and requires explicit user approval rather than an automatic run
- a narrated public demo video, `/feedback` submission field, and final Devpost submission
- practitioner testing or evidence of productivity improvement

## Local setup

Requirements: Node.js 22.x and npm. Use the lockfile-backed install so the tested dependency graph is reproduced.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Fixture mode is the default and does not require an API key. The public route rejects live requests, and the public fixture is not an arbitrary participant-intent composer. Arbitrary facilitator-collected intents exist only at the gated live-adapter boundary.

For a deliberate local live capture, edit the ignored `.env.local` created above:

```dotenv
ENABLE_OPENAI_LIVE=true
OPENAI_API_KEY=<your-key>
OPENAI_MODEL=gpt-5.6
OPENAI_REASONING_EFFORT=medium
```

Then run `npm run evidence:live`. That command and `npm run eval:style:capture` load `.env.local` explicitly on Node 22; they do not require exporting the key into the parent shell. Never commit `.env.local`. Before dispatch, the capture writes a prose-free recovery sentinel. Every normal success or failure replaces that sentinel with an append-only local receipt under the ignored `artifacts/live/live-capture-attempts/` path; if receipt persistence itself fails, the sentinel and exclusive lock remain for manual recovery instead of letting the call disappear. A typed failure with a durable receipt releases the lock, and an ordinary public-write failure rolls back the incomplete canonical pair so a later explicit retry remains possible. A completed raw-and-sanitized pair is write-once. `npm run evidence` marks it verified only after the authority-bound completed receipt is validated and copied to the public evidence set. Until a real call is captured, fixture output must not be described as GPT-5.6 output.

Run the local gate with:

```bash
npm run verify
```

The style evaluation is documented in [`STYLE-ABLATION-PROTOCOL.md`](./STYLE-ABLATION-PROTOCOL.md). Its live commands are `npm run eval:style:capture` and `npm run eval:style:report -- --ratings <ratings.json>`; do not run them without reading the write-once and no-replacement rules first.

## Repository map

- `app/`: Table workbench and stateless HTTP endpoints
- `components/table/`: workbench state machine and accessible graph view
- `src/application/`: run orchestration and frozen replay
- `src/domain/`: deterministic retrieval, validation, graph, overlay, and simulation core
- `src/contracts/`: structured model and HTTP contracts
- `src/ports/`: model boundary
- `src/adapters/`: filesystem, fixture, and gated GPT-5.6 adapters
- `src/evaluation/`: preregistered style-control contracts, schedule, masked packet, and fail-closed evaluator
- `data/world-packs/`: public-safe demo data
- `tests/`: contract, unit, API integration, replay, privacy, and browser checks
- `artifacts/evidence/`: sanitized generated fixture evidence and SHA-256 manifest
- `docs/`: PRD, architecture, evidence, and submission preparation
- `_dev/CORE-BUILD-DISPATCH.md`: clean Codex-session contract for core implementation

## Why this is not README.md yet

This file remains the technical entry point because `package-project-evidence` write and derive preflights currently report `SERVING_CANDIDATE`. The executable Evidence Packet exists, but the skill requires explicit user approval and a rerun with `--allow-candidate` before README generation. The user's prohibition on `juhyeong-voice` also remains binding. Live GPT-5.6 evidence is a separate pending gate.

## Official OpenAI implementation sources

- [Using GPT-5.6](https://developers.openai.com/api/docs/guides/latest-model)
- [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [GPT-5.6 prompt guidance](https://developers.openai.com/api/docs/guides/prompt-guidance-gpt-5p6)
