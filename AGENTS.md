# Repository operating contract

This repository is the public-safe Build Week workspace for a narrative ontology harness. Read this file and `_dev/CORE-BUILD-DISPATCH.md` before implementing the core slice.

## Product boundary

- Track: Work & Productivity.
- Working technical label: Narrative Ontology Harness. Do not invent or lock a final brand name.
- Core slice: World Pack → deterministic retrieval → GPT-5.6 structured draft → hard validation → creator decision → canon overlay → frozen replay.
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
7. Add no graph database, embeddings, authentication, collaboration server, multi-agent orchestration, or general-purpose editor during the MVP.
8. Record rejected alternatives and the condition that would make each one worth revisiting.

## Verification

The local done gate is:

```bash
npm run verify
```

Live GPT-5.6 smoke tests are manual and must be reported separately. Never claim a live integration from fixture-only evidence.

## Current phase

Day 0 scaffold only. Contracts, static presentation, sample data, and contract tests may be present. Retrieval, live GPT-5.6 generation, validators, creator gate, replay engine, and final README remain pending until their tests and evidence exist.
