# Start here

This is the Day 0 scaffold for a Build Week Work & Productivity project. The final product name is intentionally undecided; “Narrative Ontology Harness” is a technical working label.

## Product in one sentence

A creative engine that writes inside a creator's world, cites the canon it used, and asks before making new lore official.

The intended users are writers, narrative designers, and tabletop game masters who spend time correcting plausible-sounding continuity errors after AI generation. The product does not claim that a language model “remembers the world.” It builds a visible control path around the model:

```text
World Pack
→ deterministic retrieval
→ GPT-5.6 structured draft
→ hard validation
→ creator decision
→ versioned canon overlay
→ frozen replay
```

## Current truth

Implemented in this scaffold:

- Next.js and TypeScript application shell
- strict World Pack and model-draft contracts
- a small public-safe Greek mythology fixture
- fixture/live evidence boundary
- contract tests and CI skeleton
- product, architecture, demo, submission, and evidence plans

Not implemented yet:

- retrieval
- live GPT-5.6 call
- hard validators
- creator accept/edit/reject flow
- canon hashing and versioned overlay
- executable replay runner
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

The repository's evidence-packaging skill failed its README write preflight because its source manifest is stale. This file is a temporary technical entry point. A public README remains a submission blocker until that skill is refreshed and the implemented claims can be re-audited.

## Official OpenAI implementation sources

- [Using GPT-5.6](https://developers.openai.com/api/docs/guides/latest-model)
- [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [GPT-5.6 prompt guidance](https://developers.openai.com/api/docs/guides/prompt-guidance-gpt-5p6)
