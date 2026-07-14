# Repository operating contract

This repository is the public-safe Build Week workspace for a narrative knowledge harness. Read this file and `_dev/CORE-BUILD-DISPATCH.md` before implementing the core slice.

## Product boundary

- Track: Work & Productivity.
- Working technical label: Narrative Knowledge Harness. Do not invent or lock a final brand name.
- Primary users: professional GMs, narrative production teams, and game scenario or quest designers.
- Core slice: registered frozen two-intent public rehearsal / gated facilitator-collected live intents + creator-owned style profile → character-scoped retrieval → structured draft → hard validation → creator decision → canon overlay and deterministic state transition → canon/knowledge graph view → frozen replay.
- Default policy: closed world. Unsupported facts are blocked or surfaced as expansion proposals.
- GPT-5.6 live runs and deterministic fixture runs must never be presented as the same evidence.

## Public-safe boundary

Only source code, synthetic inputs, original summaries of public-domain mythology, sanitized run metadata, and derived test results belong here.

Never add private story IP, personal conversations, private knowledge-base content, absolute personal paths, API keys, raw Codex logs, or a `/feedback` session ID. Store the latter only in a gitignored private submission record and the Devpost form.

## Implementation rules

1. Lock schemas and failing tests before runtime behavior.
2. Keep deterministic domain logic separate from model and filesystem I/O.
3. Use Responses API Structured Outputs with strict schemas for GPT-5.6. Do not add function calling or Programmatic Tool Calling unless a measured need appears.
4. Every hard violation fails closed. A blocked draft is untrusted and cannot update canon.
5. Creator approval must be version-aware. An unapproved, rejected, or stale proposal cannot change the canon hash.
6. Tie-breaking in retrieval and replay must be deterministic.
7. The MVP includes a deterministic graph view derived from typed JSON, a registered frozen two-intent fixture with explicit lineage, a gated arbitrary-intent live boundary, and a bounded two-step simulation. Do not claim the fixture composes arbitrary text, a graph database, remote multi-user room, or long-running autonomous simulation.
8. Add no graph database, embeddings, authentication, collaboration server, multi-agent orchestration, or general-purpose editor during the MVP.
9. Record rejected alternatives and the condition that would make each one worth revisiting.
10. Style profiles must be original, explicit constraint bundles. Do not imitate a living author or claim model-vendor writing superiority without a controlled evaluation.

## Verification

The local done gate is:

```bash
npm run verify
```

Live GPT-5.6 smoke tests are manual and must be reported separately. Never claim a live integration from fixture-only evidence.

## Current phase

Core fixture vertical slice and post-core truth audit verified. Participant/style contracts, deterministic retrieval and validators, registered public-fixture authority, world-aware creator gate, style and knowledge receipts, graph descriptors, two-step simulation, replay engine, gated GPT-5.6 adapter and capture transaction, Table UI, sanitized fixture evidence, preregistered style-ablation protocol, production build, and browser smoke exist. A prior implementation proof passed fresh-copy rehearsal; the final candidate still requires its own post-commit identified record. A real GPT-5.6 trace, four-call style capture and creator ratings, final README, public remote/deployment, video, `/feedback` field, and Devpost submission remain separate release gates. Never promote fixture or protocol evidence into a live-model result.
